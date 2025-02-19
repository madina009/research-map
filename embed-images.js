import {
  AutoProcessor,
  CLIPVisionModelWithProjection,
  RawImage,
} from "@xenova/transformers";
import * as fs from "fs/promises";

const processor = await AutoProcessor.from_pretrained(
  "Xenova/clip-vit-base-patch16"
);

let vision_model = await CLIPVisionModelWithProjection.from_pretrained(
  "Xenova/clip-vit-base-patch16"
);

const pages = await fs.readdir("pages");

const embeds = [];

for (const filename of pages) {
  if (!filename.endsWith(".md")) continue;
  const text = await fs.readFile(`pages/${filename}`);
  const page = JSON.parse(text);
  // console.log(page);
  for (const block of page.content) {
    if (block.type !== "image") continue;
    const { filename } = block;
    const url = `images/${filename}`;
    console.log(url);
    let image = await RawImage.read(url);
    let image_inputs = await processor(image);
    let { image_embeds } = await vision_model(image_inputs);
    let embedArray = Array.from(image_embeds.data);
    // console.log('title', page.title);
    embeds.push({
      filename,
      title: page.title,
      tags: page.tags,
      width: image.width,
      height: image.height,
      embed: embedArray,
    });

  }

}


await fs.writeFile("image_embeds.json", JSON.stringify(embeds));

// // const url = `images/0a0dbaacb708b0615c1af043b1cc1c95.jpg`;
// // let image = await RawImage.read(url);
// // let image_inputs = await processor(image);
// // let { image_embeds } = await vision_model(image_inputs);
// // //   return image_embeds;
// // console.log(image_embeds);
