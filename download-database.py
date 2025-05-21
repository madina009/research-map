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
            print(f"Finished fetching database items. Total query pages fetched: {page_count}, Total page entries retrieved: {len(all_results)}")
            break

    return {"results": all_results, "object": "list", "has_more": False, "next_cursor": None}


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


def parse_rich_text(rich_text_items):
    """Parses Notion's rich text array into a single string."""
    full_text = ""
    for item in rich_text_items:
        if item["type"] == "text":
            full_text += item["text"]["content"]
    return full_text.strip()


def get_all_image_urls_from_block_tree(start_block_id):
    """
    Recursively fetches all image URLs starting from a given block ID,
    traversing through all its children and their children.
    """
    all_image_urls = []
    queue_of_block_ids_to_process = [start_block_id]
    processed_block_ids = set()

    while queue_of_block_ids_to_process:
        current_parent_block_id = queue_of_block_ids_to_process.pop(0)

        if current_parent_block_id in processed_block_ids:
            continue

        if current_parent_block_id != start_block_id:
            processed_block_ids.add(current_parent_block_id)

        child_blocks = get_all_block_children(current_parent_block_id)

        for block in child_blocks:
            if block["type"] == "image":
                image_data = block.get("image")
                image_url = None
                if image_data:
                    if image_data.get("file"):
                        image_url = image_data["file"]["url"]
                    elif image_data.get("external"):
                        image_url = image_data["external"]["url"]

                if image_url and image_url not in all_image_urls:
                    all_image_urls.append(image_url)

            if block.get("has_children"):
                if block["id"] not in processed_block_ids and block["id"] not in queue_of_block_ids_to_process:
                    queue_of_block_ids_to_process.append(block["id"])

    return all_image_urls


def get_page_content_and_images(page_id):
    """
    Retrieves and parses content (paragraphs, quotes from top-level blocks) for a given page,
    and collects ALL image URLs (including nested ones) for download.
    Returns a tuple: (page_items_for_json, image_urls_to_download)
    """
    image_urls_to_download = get_all_image_urls_from_block_tree(page_id)
    all_top_level_blocks = get_all_block_children(page_id)
    page_items_for_json = []

    print(f"Processing page {page_id}, total top-level blocks found: {len(all_top_level_blocks)}")
    if image_urls_to_download:
        print(f"Total unique images found (including nested) for page {page_id}: {len(image_urls_to_download)}")

    for block in all_top_level_blocks:
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
            image_url_for_filename = None
            if image_data and image_data.get("file"):
                image_url_for_filename = image_data["file"]["url"]
            elif image_data and image_data.get("external"):
                image_url_for_filename = image_data["external"]["url"]

            if image_url_for_filename:
                try:
                    parsed_url = urlparse(image_url_for_filename)
                    filename = os.path.basename(parsed_url.path)
                    if not filename:
                        filename = f"{block['id']}.jpg"
                    page_items_for_json.append({"type": "image", "filename": filename})
                except Exception as e:
                    print(f"Error parsing image URL {image_url_for_filename} for filename in top-level block: {e}")
                    page_items_for_json.append({"type": "image", "filename": "unknown_image.jpg"})
    return page_items_for_json, image_urls_to_download


def download_image(url, folder="images"):
    """Downloads an image from a URL to a specified folder."""
    try:
        parsed_url = urlparse(url)
        filename = os.path.basename(parsed_url.path)
        if not filename:
            filename = f"image_{url.split('/')[-2] if len(url.split('/')) > 2 else 'downloaded'}.jpg"

        filepath = os.path.join(folder, filename)

        if os.path.exists(filepath):
            print(f"File {filename} already exists in {folder}, skipping download.")
            return filename

        print(f"Downloading {filepath}...")
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

        page_content_json, image_urls = get_page_content_and_images(page_id)

        page_object = {
            "id": page_id,
            "title": title,
            "tags": tags,
            "content": page_content_json,
        }

        page_filename = f"{page_id}.json"
        filepath = os.path.join("pages", page_filename)
        try:
            with open(filepath, "w", encoding="utf-8") as f:
                json.dump(page_object, f, indent=2, ensure_ascii=False)
            print(f"Saved page content to {filepath}")
        except IOError as e:
            print(f"Error writing page content to {filepath}: {e}")

        if image_urls:
            print(f"Found {len(image_urls)} unique images (including nested) for page {title}.")
            for img_url in image_urls:
                download_image(img_url, folder="images")
        else:
            print(f"No images found for page {title}.")

    page_filenames_for_index = [f"{pid}.json" for pid in all_page_ids]
    index_filepath = os.path.join("pages", "index.json")
    try:
        with open(index_filepath, "w", encoding="utf-8") as f:
            json.dump(page_filenames_for_index, f, indent=2, ensure_ascii=False)
        print(f"\nSuccessfully created index file at {index_filepath}")
    except IOError as e:
        print(f"Error writing index file to {index_filepath}: {e}")

if __name__ == "__main__":
    main()
