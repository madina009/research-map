

import os
from PIL import Image
import pillow_heif

# Register HEIC opener
pillow_heif.register_heif_opener()

def resize_and_convert_images(input_folder="images", output_folder="images_resized", longest_side=800):
    """
    Resizes images from the input folder so their longest side is `longest_side` pixels,
    maintaining aspect ratio, and converts them to JPEG format in the output folder.

    Supported input formats: PNG, JPEG, GIF, HEIC.
    Output format: JPEG.
    """

    if not os.path.exists(output_folder):
        os.makedirs(output_folder)
        print(f"Created output folder: {output_folder}")

    supported_extensions = ('.png', '.jpg', '.jpeg', '.gif', '.heic', '.heif')

    for filename in os.listdir(input_folder):
        input_path = os.path.join(input_folder, filename)

        if not os.path.isfile(input_path):
            print(f"Skipping non-file: {filename}")
            continue

        file_ext = os.path.splitext(filename)[1].lower()

        if file_ext not in supported_extensions:
            print(f"Skipping unsupported file type: {filename}")
            continue

        try:
            img = Image.open(input_path)

            # Handle potential RGBA or P mode images for JPEG conversion
            if img.mode == 'RGBA' or img.mode == 'P':
                img = img.convert('RGB')

            original_width, original_height = img.size

            if original_width == 0 or original_height == 0:
                print(f"Skipping image with zero dimension: {filename}")
                continue

            # Determine the new dimensions
            if original_width > original_height:
                if original_width <= longest_side:
                    new_width = original_width
                    new_height = original_height
                else:
                    new_width = longest_side
                    new_height = int(original_height * (longest_side / original_width))
            else:
                if original_height <= longest_side:
                    new_height = original_height
                    new_width = original_width
                else:
                    new_height = longest_side
                    new_width = int(original_width * (longest_side / original_height))

            # Ensure dimensions are at least 1x1
            new_width = max(1, new_width)
            new_height = max(1, new_height)

            resized_img = img.resize((new_width, new_height), Image.Resampling.LANCZOS)

            base_filename = os.path.splitext(filename)[0]
            output_filename = f"{base_filename}.jpg"
            output_path = os.path.join(output_folder, output_filename)

            resized_img.save(output_path, "JPEG", quality=90) # Adjust quality as needed
            print(f"Processed and saved: {output_filename}")

        except FileNotFoundError:
            print(f"Error: File not found {input_path}")
        except pillow_heif.HeifError as e:
            print(f"Error processing HEIC file {filename}: {e}. Ensure libheif is installed.")
        except Exception as e:
            print(f"Error processing {filename}: {e}")

if __name__ == "__main__":
    # Create dummy input folder and images for testing if they don't exist
    if not os.path.exists("images"):
        os.makedirs("images")
        print("Created dummy 'images' folder for testing.")
        # You might want to add some dummy image files here for a full test
        # e.g., create a dummy PNG:
        try:
            from PIL import ImageDraw
            if not os.path.exists("images/sample.png"):
                img_test = Image.new('RGB', (1200, 900), color = 'red')
                d = ImageDraw.Draw(img_test)
                d.text((10,10), "Sample PNG", fill=(255,255,0))
                img_test.save("images/sample.png")
                print("Created images/sample.png for testing.")
            if not os.path.exists("images/sample.jpg"):
                img_test_jpg = Image.new('RGB', (900, 1200), color = 'blue')
                d_jpg = ImageDraw.Draw(img_test_jpg)
                d_jpg.text((10,10), "Sample JPG", fill=(255,255,0))
                img_test_jpg.save("images/sample.jpg")
                print("Created images/sample.jpg for testing.")
            # Note: Creating a dummy HEIC programmatically is complex.
            # It's better to place a real HEIC file in the 'images' folder for testing HEIC.
            if not any(f.lower().endswith(('.heic', '.heif')) for f in os.listdir("images")):
                print("INFO: No HEIC files found in 'images' folder for testing HEIC conversion.")
                print("      Please add a .heic or .heif file to 'images' to test this functionality.")

        except ImportError:
            print("Pillow is not fully installed (missing ImageDraw) - cannot create dummy images.")
        except Exception as e:
            print(f"Could not create dummy image: {e}")


    resize_and_convert_images()
    print("Image processing complete.")
