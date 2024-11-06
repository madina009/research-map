import os
import requests
from dotenv import load_dotenv
from urllib.parse import urlparse, parse_qs
import json

load_dotenv()

NOTION_API_KEY = os.getenv("NOTION_API_KEY")
NOTION_DB_ID = os.getenv("NOTION_DB_ID")
NOTION_VERSION = "2022-06-28"

headers = {
    "Authorization": f"Bearer {NOTION_API_KEY}",
    "Notion-Version": NOTION_VERSION,
}

if not os.path.exists("pages"):
    os.makedirs("pages")

if not os.path.exists("images"):
    os.makedirs("images")


def get_database_items():
    url = f"https://api.notion.com/v1/databases/{NOTION_DB_ID}/query"
    response = requests.post(url, headers=headers)
    data = response.json()
    return data


def get_tags_for_page(page_id):
    url = f"https://api.notion.com/v1/pages/{page_id}/properties/Tags"
    response = requests.get(url, headers=headers)
    data = response.json()
    if data.get("status") == 400:
        # The property Tags does not exist on the page.
        return []
    tags = data["multi_select"]
    if len(tags) == 0:
        # There is a property Tags but it is empty.
        return []
    tags = [t["name"] for t in tags]
    return tags


def get_image_urls_for_page(page_id):
    url = f"https://api.notion.com/v1/blocks/{page_id}/children"
    response = requests.get(url, headers=headers)
    data = response.json()
    image_urls = []
    # FIXME: add error checking
    for child in data["results"]:
        child_id = child["id"]
        child_type = child["type"]
        if child_type == "image":
            image_url = child["image"]["file"]["url"]
            image_urls.append(image_url)
    return image_urls


def get_page_content(page_id):
    url = f"https://api.notion.com/v1/blocks/{page_id}/children"
    response = requests.get(url, headers=headers)
    data = response.json()
    page_items = []
    for child in data["results"]:
        child_id = child["id"]
        child_type = child["type"]
        if child_type == "paragraph":
            text_items = child["paragraph"]["rich_text"]
            all_text = ""
            for text_item in text_items:
                if text_item["type"] != "text":
                    continue
                text = text_item["text"]["content"]
                all_text += text
            if all_text.strip() == "":
                continue
            page_items.append({"type": "paragraph", "text": all_text})
        elif child_type == "quote":
            text_items = child["quote"]["rich_text"]
            all_text = ""
            for text_item in text_items:
                if text_item["type"] != "text":
                    continue
                text = text_item["text"]["content"]
                all_text += text
            if all_text.strip() == "":
                continue
            page_items.append({"type": "quote", "text": all_text})
        if child_type == "image":
            image_url = child["image"]["file"]["url"]
            parsed_url = urlparse(image_url)
            path = parsed_url.path
            filename = path.split("/")[-1]
            page_items.append({"type": "image", "filename": filename})

    return page_items


def download_image(url, folder="images"):
    parsed_url = urlparse(url)
    path = parsed_url.path
    filename = path.split("/")[-1]
    if os.path.exists(f"{folder}/{filename}"):
        print(f"File {filename} already exists, skipping download.")
        return
    response = requests.get(url)
    print(filename)
    with open(f"{folder}/{filename}", "wb") as f:
        f.write(response.content)


data = get_database_items()

for result in data.get("results", []):
    page_id = result["id"]
    title = result["properties"]["Name"]["title"][0]["plain_text"]
    print(title)

    # Retrieve the tags for this page
    tags = get_tags_for_page(page_id)
    print(tags)

    page_content = get_page_content(page_id)
    page_object = {
        "title": title,
        "tags": tags,
        "content": page_content,
    }
    with open(f"pages/{page_id}.md", "w") as f:
        f.write(json.dumps(page_object, indent=2))

    image_urls = get_image_urls_for_page(page_id)
    for image_url in image_urls:
        download_image(image_url)

# Create a list of all page filenames
page_filenames = [
    f"{page_id}.md" for result in data.get("results", []) for page_id in [result["id"]]
]

# Write the list to pages/index.json
with open("pages/index.json", "w") as f:
    json.dump(page_filenames, f, indent=2)
