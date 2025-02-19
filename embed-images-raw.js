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

const images = await fs.readdir("images");

const embeds = [];

for (const filename of images) {
  if (
    !(
      filename.endsWith(".jpg") ||
      filename.endsWith(".jpeg") ||
      filename.endsWith(".gif") ||
      filename.endsWith(".png")
    )
  )
    continue;
  console.log(filename);
  const url = `images/${filename}`;
  let image = await RawImage.read(url);
  let image_inputs = await processor(image);
  let { image_embeds } = await vision_model(image_inputs);
  let embedArray = Array.from(image_embeds.data);
  //   let l2Norm = Math.sqrt(embedArray.reduce((acc, val) => acc + val * val, 0));
  //   let normalizedEmbed = embedArray.map((val) => val / l2Norm);

  embeds.push({
    filename,
    width: image.width,
    height: image.height,
    embed: embedArray,
  });
}

await fs.writeFile("image_embeds.json", JSON.stringify(embeds));

// const url = `images/0a0dbaacb708b0615c1af043b1cc1c95.jpg`;
// let image = await RawImage.read(url);
// let image_inputs = await processor(image);
// let { image_embeds } = await vision_model(image_inputs);
// //   return image_embeds;
// console.log(image_embeds);
