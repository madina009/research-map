import { AutoProcessor, CLIPVisionModelWithProjection, RawImage } from "@xenova/transformers";
import * as fs from "fs/promises";

const processor = await AutoProcessor.from_pretrained("Xenova/clip-vit-base-patch16");

let vision_model = await CLIPVisionModelWithProjection.from_pretrained("Xenova/clip-vit-base-patch16");

const pages = await fs.readdir("pages");

const embeds = [];

for (const filename of pages) {
  if (!filename.endsWith(".json")) continue;
  const text = await fs.readFile(`pages/${filename}`);
  const page = JSON.parse(text);
  // console.log(page);
  if (!page.content) {
    console.log(`File ${filename}: no contents!!`);
    continue;
  }
  for (const block of page.content) {
    if (block.type !== "image") continue;
    const { filename } = block; // original filename, e.g., "image.png", "photo.heic"

    // Strip off the original extension from filename and append .jpg for the URL
    const baseFilename = filename.substring(0, filename.lastIndexOf("."));
    const newFilename = `${baseFilename}.jpg`;
    const url = `images_resized/${newFilename}`; // URL will always point to a .jpg file

    console.log(url); // Logs the path to the .jpg file in images_resized

    // Determine the extension from the original filename to decide if we process it
    try {
      let image = await RawImage.read(url); // Read the .jpg file
      let image_inputs = await processor(image);
      let { image_embeds } = await vision_model(image_inputs);
      let embedArray = Array.from(image_embeds.data);
      // console.log('title', page.title);
      embeds.push({
        filename: newFilename,
        title: page.title,
        tags: page.tags,
        width: image.width,
        height: image.height,
        embed: embedArray,
      });
    } catch (e) {
      console.log(e);
    }
  }
}

await fs.writeFile("image_embeds.json", JSON.stringify(embeds));

// // const url = `images/0a0dbaacb708b0615c1af043b1cc1c95.jpg`;
// // let image = await RawImage.read(url);
// // let image_inputs = await processor(image);
// // let { image_embeds } = await vision_model(image_inputs);
// // //   return image_embeds;
// // console.log(image_embeds);
