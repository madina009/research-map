import os
import requests
from dotenv import load_dotenv
from urllib.parse import urlparse
import json

load_dotenv()

NOTION_API_KEY = os.getenv("NOTION_API_KEY")
NOTION_DB_ID = os.getenv("NOTION_DB_ID")
NOTION_VERSION = "2022-06-28"
DEFAULT_PAGE_SIZE = 100

HEADERS = {
    "Authorization": f"Bearer {NOTION_API_KEY}",
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
}

# Create directories if they don't exist
os.makedirs("pages", exist_ok=True)
os.makedirs("images", exist_ok=True)


def make_notion_request(method, url, **kwargs):
    """Helper function to make requests to the Notion API and handle errors."""
    try:
        response = requests.request(method, url, headers=HEADERS, **kwargs)
        response.raise_for_status()  # Raises an HTTPError for bad responses (4XX or 5XX)
        return response.json()
    except requests.exceptions.HTTPError as http_err:
        print(f"HTTP error occurred: {http_err} - {response.text}")
        # Attempt to parse JSON error from Notion if available
        try:
            error_details = response.json()
            print(f"Notion API error details: {error_details}")
        except json.JSONDecodeError:
            print("Could not parse Notion API error response.")
        return None # Or raise a custom exception
    except requests.exceptions.RequestException as req_err:
        print(f"Request exception occurred: {req_err}")
        return None # Or raise a custom exception
    except json.JSONDecodeError as json_err:
        print(f"JSON decode error: {json_err} - Response text: {response.text}")
        return None


def get_database_items():
    """Retrieves all items from the configured Notion database."""
    url = f"https://api.notion.com/v1/databases/{NOTION_DB_ID}/query"
    # Notion API for database query uses POST, even if just querying
    return make_notion_request("POST", url, json={})


def get_property_details(page_id, property_name_or_id):
    """Helper to get details of a specific property for a page."""
    url = f"https://api.notion.com/v1/pages/{page_id}/properties/{property_name_or_id}"
    return make_notion_request("GET", url)


def get_tags_for_page(page_id):
    """Retrieves tags for a given page."""
    data = get_property_details(page_id, "Tags")
    if not data or "multi_select" not in data:
        # Handles cases where 'Tags' property doesn't exist or is not multi_select
        # or if there was an API error.
        print(f"Could not retrieve tags for page {page_id} or 'Tags' property is not multi_select. Data: {data}")
        return []
    return [tag["name"] for tag in data["multi_select"]]


def get_block_children(block_id, start_cursor=None):
    """Retrieves child blocks for a given block, handling pagination."""
    url = f"https://api.notion.com/v1/blocks/{block_id}/children"
    params = {"page_size": DEFAULT_PAGE_SIZE}
    if start_cursor:
        params["start_cursor"] = start_cursor
    return make_notion_request("GET", url, params=params)


def get_all_block_children(block_id):
    """Retrieves all child blocks for a given block, iterating through all pages."""
    all_results = []
    next_cursor = None
    while True:
        data = get_block_children(block_id, start_cursor=next_cursor)
        if not data or "results" not in data:
            print(f"Failed to retrieve block children for {block_id} or data is malformed.")
            break
        all_results.extend(data["results"])
        next_cursor = data.get("next_cursor")
        if not next_cursor:
            break
    return all_results


def get_image_urls_from_blocks(blocks):
    """Extracts image URLs from a list of blocks."""
    image_urls = []
    for block in blocks:
        if block["type"] == "image" and block.get("image", {}).get("file"):
            image_urls.append(block["image"]["file"]["url"])
        elif block["type"] == "image" and block.get("image", {}).get("external"): # Handle external images too
            image_urls.append(block["image"]["external"]["url"])
    return image_urls


def parse_rich_text(rich_text_items):
    """Parses Notion's rich text array into a single string."""
    full_text = ""
    for item in rich_text_items:
        if item["type"] == "text":
            full_text += item["text"]["content"]
    return full_text.strip()


def get_page_content_and_images(page_id):
    """
    Retrieves and parses all content (paragraphs, quotes, images) for a given page,
    handling pagination for block children.
    Returns a tuple: (page_items_for_json, image_urls_to_download)
    """
    all_blocks = get_all_block_children(page_id)
    page_items_for_json = []
    image_urls_to_download = []

    print(f"Processing page {page_id}, total blocks found: {len(all_blocks)}")

    for block in all_blocks:
        block_type = block["type"]
        content = ""

        if block_type == "paragraph" and block.get("paragraph", {}).get("rich_text"):
            content = parse_rich_text(block["paragraph"]["rich_text"])
            if content:
                page_items_for_json.append({"type": "paragraph", "text": content})
        elif block_type == "quote" and block.get("quote", {}).get("rich_text"):
            content = parse_rich_text(block["quote"]["rich_text"])
            if content:
                page_items_for_json.append({"type": "quote", "text": content})
        elif block_type == "image":
            image_data = block.get("image")
            image_url = None
            if image_data and image_data.get("file"):
                image_url = image_data["file"]["url"]
            elif image_data and image_data.get("external"): # Handle external images
                image_url = image_data["external"]["url"]

            if image_url:
                image_urls_to_download.append(image_url)
                try:
                    parsed_url = urlparse(image_url)
                    # A more robust way to get filename, handles query params etc.
                    filename = os.path.basename(parsed_url.path)
                    if not filename: # if path ends with / or is empty
                        # Fallback or generate a unique name if needed
                        filename = f"{block['id']}.jpg" # Default extension, Notion might not provide one
                    page_items_for_json.append({"type": "image", "filename": filename})
                except Exception as e:
                    print(f"Error parsing image URL {image_url} for filename: {e}")
                    # Optionally, append with a placeholder or skip
                    page_items_for_json.append({"type": "image", "filename": "unknown_image.jpg"})


    return page_items_for_json, image_urls_to_download


def download_image(url, folder="images"):
    """Downloads an image from a URL to a specified folder."""
    try:
        parsed_url = urlparse(url)
        filename = os.path.basename(parsed_url.path)
        if not filename: # Fallback for URLs without clear filenames in path
             # Create a more unique name if possible, or use a generic one
            filename = f"image_{url.split('/')[-2] if len(url.split('/')) > 2 else 'downloaded'}.jpg"

        filepath = os.path.join(folder, filename)

        if os.path.exists(filepath):
            print(f"File {filename} already exists in {folder}, skipping download.")
            return filename # Return filename even if skipped

        print(f"Downloading {url} to {filepath}...")
        response = requests.get(url, stream=True) # Use stream=True for large files
        response.raise_for_status()
        with open(filepath, "wb") as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
        print(f"Successfully downloaded {filename}")
        return filename
    except requests.exceptions.RequestException as e:
        print(f"Error downloading image {url}: {e}")
        return None
    except IOError as e:
        print(f"Error saving image {filename}: {e}")
        return None


def main():
    """Main function to orchestrate database download."""
    database_data = get_database_items()
    if not database_data or "results" not in database_data:
        print("Failed to retrieve database items or database is empty.")
        return

    all_page_ids = []

    for page_result in database_data.get("results", []):
        page_id = page_result["id"]
        all_page_ids.append(page_id)

        try:
            title_property = page_result.get("properties", {}).get("Name", {}).get("title", [])
            if not title_property:
                print(f"Page {page_id} has no 'Name' property or title is empty. Skipping.")
                title = f"Untitled Page - {page_id}" # Fallback title
            else:
                title = title_property[0]["plain_text"]
        except (KeyError, IndexError, TypeError) as e:
            print(f"Error extracting title for page {page_id}: {e}. Page data: {page_result.get('properties', {}).get('Name')}")
            title = f"Untitled Page - {page_id}" # Fallback title

        print(f"\nProcessing page: {title} (ID: {page_id})")

        tags = get_tags_for_page(page_id)
        print(f"Tags: {tags}")

        page_content_json, image_urls = get_page_content_and_images(page_id)

        page_object = {
            "id": page_id,
            "title": title,
            "tags": tags,
            "content": page_content_json,
        }

        # Save page content to a JSON file (changed from .md to .json for clarity)
        page_filename = f"{page_id}.json"
        filepath = os.path.join("pages", page_filename)
        try:
            with open(filepath, "w", encoding="utf-8") as f:
                json.dump(page_object, f, indent=2, ensure_ascii=False)
            print(f"Saved page content to {filepath}")
        except IOError as e:
            print(f"Error writing page content to {filepath}: {e}")


        # Download images for the current page
        if image_urls:
            print(f"Found {len(image_urls)} images for page {title}.")
            for img_url in image_urls:
                download_image(img_url, folder="images")
        else:
            print(f"No images found for page {title}.")


    # Create a list of all page filenames (now .json)
    page_filenames_for_index = [f"{pid}.json" for pid in all_page_ids]

    # Write the list to pages/index.json
    index_filepath = os.path.join("pages", "index.json")
    try:
        with open(index_filepath, "w", encoding="utf-8") as f:
            json.dump(page_filenames_for_index, f, indent=2, ensure_ascii=False)
        print(f"\nSuccessfully created index file at {index_filepath}")
    except IOError as e:
        print(f"Error writing index file to {index_filepath}: {e}")

if __name__ == "__main__":
    main()
