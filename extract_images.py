import fitz  # PyMuPDF
import os

# 1. Open your PDF file (make sure the name matches exactly!)
pdf_filename = "motion_1d&2d.pdf"
doc = fitz.open(pdf_filename)

# 2. Create a folder to save all the extracted images
output_folder = "extracted_images"
os.makedirs(output_folder, exist_ok=True)

img_count = 0

print(f"Scanning {pdf_filename} for images...")

# 3. Loop through every page in the PDF
for page_num in range(len(doc)):
    page = doc[page_num]
    
    # Get a list of all images on this specific page
    image_list = page.get_images(full=True)
    
    for img in image_list:
        xref = img[0]
        
        # Extract the image data
        base_image = doc.extract_image(xref)
        image_bytes = base_image["image"]
        image_ext = base_image["ext"]  # Usually 'png' or 'jpeg'
        
        img_count += 1
        
        # Create the file name (e.g., extracted_images/img_1.png)
        image_name = f"{output_folder}/kinematics_{img_count}.{image_ext}"
        
        # Save the image to your computer
        with open(image_name, "wb") as f:
            f.write(image_bytes)

print(f"✅ Success! Extracted {img_count} images into the '{output_folder}' folder.")