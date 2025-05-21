import os
import requests
from dotenv import load_dotenv
from urllib.parse import urlparse
import json
import re

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
        response.raise_for_status()
        return response.json()
    except requests.exceptions.HTTPError as http_err:
        print(f"HTTP error occurred: {http_err} - {response.text}")
        try:
            error_details = response.json()
            print(f"Notion API error details: {error_details}")
        except json.JSONDecodeError:
            print("Could not parse Notion API error response.")
        return None
    except requests.exceptions.RequestException as req_err:
        print(f"Request exception occurred: {req_err}")
        return None
    except json.JSONDecodeError as json_err:
        print(f"JSON decode error: {json_err} - Response text: {response.text}")
        return None


def get_database_items():
    """Retrieves all items (pages) from the configured Notion database, handling pagination."""
    url = f"https://api.notion.com/v1/databases/{NOTION_DB_ID}/query"
    all_results = []
    next_cursor = None
    page_count = 0
    print("Starting to fetch database items...")
    while True:
        page_count += 1
        payload = {"page_size": DEFAULT_PAGE_SIZE}
        if next_cursor:
            payload["start_cursor"] = next_cursor

        response_data = make_notion_request("POST", url, json=payload)

        if not response_data or "results" not in response_data:
            print(f"Failed to retrieve database items or data is malformed on page {page_count} of database query.")
            break

        current_page_items = response_data.get("results", [])
        all_results.extend(current_page_items)

        next_cursor = response_data.get("next_cursor")
        has_more = response_data.get("has_more", False)

        if not has_more or not next_cursor:
            print(f"Finished fetching database items. Total query pages: {page_count}, Total page entries: {len(all_results)}")
            break
    return {"results": all_results}


def get_property_details(page_id, property_name_or_id):
    """Helper to get details of a specific property for a page."""
    url = f"https://api.notion.com/v1/pages/{page_id}/properties/{property_name_or_id}"
    return make_notion_request("GET", url)


def get_tags_for_page(page_id):
    """Retrieves tags for a given page."""
    data = get_property_details(page_id, "Tags")
    if not data or "multi_select" not in data:
        print(f"Could not retrieve tags for page {page_id} or 'Tags' property is not multi_select. Data: {data}")
        return []
    return [tag["name"] for tag in data["multi_select"]]


def get_all_block_children(block_id, start_cursor=None):
    """Retrieves all child blocks for a given block, handling pagination."""
    all_block_children_results = []
    current_start_cursor = start_cursor
    while True:
        url = f"https://api.notion.com/v1/blocks/{block_id}/children"
        params = {"page_size": DEFAULT_PAGE_SIZE}
        if current_start_cursor:
            params["start_cursor"] = current_start_cursor

        data = make_notion_request("GET", url, params=params)

        if not data or "results" not in data:
            print(f"Failed to retrieve block children for {block_id} or data is malformed.")
            break
        all_block_children_results.extend(data["results"])
        current_start_cursor = data.get("next_cursor")
        if not current_start_cursor:
            break
    return all_block_children_results


def parse_rich_text(rich_text_items):
    """Parses Notion's rich text array into a single string."""
    full_text = ""
    for item in rich_text_items:
        if item["type"] == "text":
            full_text += item["text"]["content"]
    return full_text.strip()


def generate_image_filename(image_url, block_id):
    """Generates a filename for an image, trying to use its original name or a unique ID."""
    try:
        parsed_url = urlparse(image_url)
        basename = os.path.basename(parsed_url.path)
        if basename and '.' in basename: # Has a filename and extension
             # Sanitize basename to remove problematic characters for filenames
            sanitized_basename = re.sub(r'[\\/*?:"<>|]', "_", basename)
            # Ensure it's not too long
            name_part, ext_part = os.path.splitext(sanitized_basename)
            return f"{name_part[:50]}{ext_part}" # Limit name part length
        # Fallback if no clear filename in URL path
        # Try to get a somewhat descriptive name from the URL if possible
        url_parts = image_url.split('/')
        potential_name = url_parts[-2] if len(url_parts) > 2 else url_parts[-1]
        sanitized_potential_name = re.sub(r'[\\/*?:"<>|]', "_", potential_name)
        # Use block_id for uniqueness if the name is too generic or missing
        return f"image_{block_id}_{sanitized_potential_name[:30]}.jpg" # Default to .jpg
    except Exception as e:
        print(f"Error generating filename for URL {image_url}: {e}")
        return f"image_{block_id}_fallback.jpg"


def extract_flat_content_and_collect_images_recursive(block_id, images_to_download_list):
    """
    Recursively extracts flat content (paragraphs, quotes, image placeholders)
    from a block and its children. Collects image URLs and their generated filenames.
    """
    flat_content_list = []

    # Get direct children of the current block_id
    child_blocks = get_all_block_children(block_id)

    for block in child_blocks:
        block_type = block["type"]

        if block_type == "paragraph" and block.get("paragraph", {}).get("rich_text"):
            text = parse_rich_text(block["paragraph"]["rich_text"])
            if text:
                flat_content_list.append({"type": "paragraph", "text": text})
        elif block_type == "quote" and block.get("quote", {}).get("rich_text"):
            text = parse_rich_text(block["quote"]["rich_text"])
            if text:
                flat_content_list.append({"type": "quote", "text": text})
        elif block_type == "image":
            image_data = block.get("image")
            image_url = None
            if image_data:
                if image_data.get("file"):
                    image_url = image_data["file"]["url"]
                elif image_data.get("external"):
                    image_url = image_data["external"]["url"]

            if image_url:
                filename = generate_image_filename(image_url, block["id"])
                flat_content_list.append({"type": "image", "filename": filename})
                # Add to download list, ensuring no duplicates based on URL
                if not any(img_info["url"] == image_url for img_info in images_to_download_list):
                    images_to_download_list.append({"url": image_url, "filename": filename})

        # If the block has children, recurse
        if block.get("has_children"):
            # print(f"Block {block['id']} (type: {block_type}) has children, recursing...")
            nested_content, _ = extract_flat_content_and_collect_images_recursive(block["id"], images_to_download_list)
            flat_content_list.extend(nested_content)

    return flat_content_list, images_to_download_list


def get_page_data_and_images_to_download(page_id):
    """
    Retrieves all content for a page as a flat list (paragraphs, quotes, images)
    and a list of all unique images to download with their target filenames.
    """
    print(f"Processing page {page_id} for flat content and images...")
    images_to_download_list = [] # This will be populated by the recursive call

    # For a page, its "children" are the top-level blocks.
    # The recursive function will start by fetching children of page_id.
    page_flat_content, all_images_for_page = extract_flat_content_and_collect_images_recursive(page_id, images_to_download_list)

    if all_images_for_page:
        print(f"Total unique images identified for page {page_id}: {len(all_images_for_page)}")

    return page_flat_content, all_images_for_page


def download_image_with_filename(url, filename, folder="images"):
    """Downloads an image from a URL to a specified folder with a given filename."""
    filepath = os.path.join(folder, filename)

    if os.path.exists(filepath):
        print(f"File {filename} already exists in {folder}, skipping download.")
        return filename

    print(f"Downloading {url} to {filepath}...")
    try:
        response = requests.get(url, stream=True)
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
    """Main function to orchestrate database download, content flattening, and image download."""
    database_data = get_database_items()
    if not database_data or "results" not in database_data:
        print("Failed to retrieve database items or database is empty.")
        return

    all_page_ids_processed = []

    for page_result in database_data.get("results", []):
        page_id = page_result["id"]

        try:
            title_property = page_result.get("properties", {}).get("Name", {}).get("title", [])
            if not title_property or not title_property[0]["plain_text"].strip():
                print(f"Page {page_id} has no 'Name' property or title is empty. Using fallback title.")
                title = f"Untitled Page - {page_id}"
            else:
                title = title_property[0]["plain_text"]
        except (KeyError, IndexError, TypeError) as e:
            print(f"Error extracting title for page {page_id}: {e}. Using fallback title.")
            title = f"Untitled Page - {page_id}"

        print(f"\nProcessing page: {title} (ID: {page_id})")

        tags = get_tags_for_page(page_id)
        print(f"Tags: {tags}")

        # Get flattened content and list of images to download for this page
        page_flat_content_list, images_to_download_for_page = get_page_data_and_images_to_download(page_id)

        page_object_for_json = {
            "id": page_id,
            "title": title,
            "tags": tags,
            "content": page_flat_content_list, # This is now the flat list
        }

        page_json_filename = f"{page_id}.json"
        filepath = os.path.join("pages", page_json_filename)
        try:
            with open(filepath, "w", encoding="utf-8") as f:
                json.dump(page_object_for_json, f, indent=2, ensure_ascii=False)
            print(f"Saved flattened page content to {filepath}")
            all_page_ids_processed.append(page_id) # Add ID for index creation
        except IOError as e:
            print(f"Error writing page content to {filepath}: {e}")

        # Download all images identified for the current page
        if images_to_download_for_page:
            print(f"Found {len(images_to_download_for_page)} unique images to download for page {title}.")
            for img_info in images_to_download_for_page:
                download_image_with_filename(img_info["url"], img_info["filename"], folder="images")
        else:
            print(f"No images found to download for page {title}.")

    # Create an index file listing all processed page JSON filenames
    if all_page_ids_processed:
        page_filenames_for_index = [f"{pid}.json" for pid in all_page_ids_processed]
        index_filepath = os.path.join("pages", "index.json")
        try:
            with open(index_filepath, "w", encoding="utf-8") as f:
                json.dump(page_filenames_for_index, f, indent=2, ensure_ascii=False)
            print(f"\nSuccessfully created index file at {index_filepath} with {len(page_filenames_for_index)} entries.")
        except IOError as e:
            print(f"Error writing index file to {index_filepath}: {e}")
    else:
        print("\nNo pages were processed, so no index file was created.")

if __name__ == "__main__":
    main()
