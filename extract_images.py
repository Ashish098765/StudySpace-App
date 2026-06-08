import os
import io
import glob
from PIL import Image
from pypdf import PdfReader

def extract_images_from_pdfs(input_folder, output_folder):
    """
    Scans all PDFs in the input folder and saves embedded images 
    named strictly as [pdf_name]_img_001.png
    """
    # Create the output directory if it doesn't exist
    os.makedirs(output_folder, exist_ok=True)
    
    # Find all PDFs in the input folder
    pdf_files = glob.glob(os.path.join(input_folder, "*.pdf"))
    
    if not pdf_files:
        print(f"📭 No PDFs found in directory: {input_folder}")
        return
        
    print(f"📂 Found {len(pdf_files)} PDF(s). Starting extraction...\n")

    for pdf_path in pdf_files:
        # Extract the exact name of the PDF without the '.pdf' extension (e.g., 'nlm')
        base_name = os.path.splitext(os.path.basename(pdf_path))[0]
        print(f"📄 Processing '{base_name}.pdf'...")
        
        try:
            reader = PdfReader(pdf_path)
        except Exception as e:
            print(f"⚠️ Could not read {pdf_path}: {e}")
            continue
            
        image_counter = 1
        
        for page_num, page in enumerate(reader.pages, start=1):
            if page.images:
                for img_file_obj in page.images:
                    img_data = img_file_obj.data
                    
                    # Skip microscopic images (like text masks or 1-pixel borders)
                    if len(img_data) < 1024: 
                        continue
                    
                    try:
                        # Load image into Pillow and standardize to RGB
                        img = Image.open(io.BytesIO(img_data)).convert("RGB")
                        
                        # NEW NAMING CONVENTION: pdfname_img_001.png
                        img_name = f"{base_name}_img_{image_counter:03d}.png"
                        img_save_path = os.path.join(output_folder, img_name)
                        
                        # Save as PNG
                        img.save(img_save_path, "PNG")
                        print(f"  ✅ Saved: {img_name} (found on Page {page_num})")
                        
                        image_counter += 1
                        
                    except Exception as e:
                        print(f"  ⚠️ Error saving an image on page {page_num}: {e}")

        print(f"🎉 Finished '{base_name}.pdf' - Extracted {image_counter - 1} images.\n")

# --- EXECUTE SCRIPT ---
if __name__ == "__main__":
    # Pointing exactly to the folder you mentioned earlier
    INPUT_DIRECTORY = os.path.abspath("./raw_pdfs")
    OUTPUT_DIRECTORY = os.path.abspath("./extracted_images")
    
    extract_images_from_pdfs(INPUT_DIRECTORY, OUTPUT_DIRECTORY)