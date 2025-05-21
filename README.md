# Notion API Project

## Requirements

- [uv](https://docs.astral.sh/uv/getting-started/installation/)
- [Homebrew](https://brew.sh/)
- `requests` package

## Installation

Install the required packages using pip:

```bash
brew install libheif
```

## Setting up your keys

- Set up a Notion integration: https://www.notion.so/profile/integrations
- Copy .env.example to .env
- Set up the database ID (find it from notion.so URL)

## Usage

Run the script to download the database:

```bash
uv run download-database.py
```

Resize the images:

```bash
uv run convert_images.py
```

To embed the images run the embed script in node.js

```bash
node embed-images.js
```
