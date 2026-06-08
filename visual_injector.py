import os
import json
import re
import io
import base64
import time
import pdfplumber
from PIL import Image
from openai import OpenAI

# ==========================================
# 1. CONFIGURE YOUR SETTINGS
# ==========================================
client = OpenAI(api_key="5gtXDBiyIZxKQRFU18jZzepkzW7eLKSM", base_url="https://api.mistral.ai/v1")

PDF_PATH = os.path.abspath("./raw_pdfs/jee_phy_nlom.pdf")
JSON_INPUT_PATH = os.path.abspath("./nlom.json")
JSON_OUTPUT_PATH = os.path.abspath("./jee_phy_nlom_FINAL_WITH_IMAGES.json")
IMAGES_DIR = os.path.abspath("./extracted_images")
BASE_NAME = "jee_phy_nlom"

os.makedirs(IMAGES_DIR, exist_ok=True)

# ==========================================
# 2. VECTOR + RASTER CLUSTERING ENGINE (THE FIX)
# ==========================================
def get_diagram_bboxes(page):
    """
    Finds bounding boxes for Raster Images AND Vector Graphics, 
    but filters out font-curves so the page doesn't merge into one giant box.
    """
    valid_boxes = []
    
    # 1. Grab all standard Raster Images (PNG/JPG)
    for img in page.images:
        valid_boxes.append([img['x0'], img['top'], img['x1'], img['bottom']])
        
    # 2. Grab Vector Graphics (Lines, Rects, Curves)
    # We MUST filter out tiny curves because PDFs often render text fonts as curves!
    for v in page.lines + page.curves + page.rects:
        w = v['x1'] - v['x0']
        h = v['bottom'] - v['top']
        
        # If the vector is smaller than 10x10, it's almost certainly a letter/comma. Skip it!
        if w > 10 or h > 10: 
            valid_boxes.append([v['x0'], v['top'], v['x1'], v['bottom']])
            
    if not valid_boxes:
        return []
        
    # Expand boxes slightly so touching lines merge into one object.
    # Reduced padding to 10 so we don't accidentally swallow nearby paragraphs.
    PADDING = 10  
    expanded = [[b[0]-PADDING, b[1]-PADDING, b[2]+PADDING, b[3]+PADDING] for b in valid_boxes]
    
    # Cluster overlapping boxes
    merged = True
    while merged:
        merged = False
        new_boxes = []
        while expanded:
            box = expanded.pop(0)
            overlap_found = False
            for i, other in enumerate(expanded):
                if not (box[2] < other[0] or box[0] > other[2] or box[3] < other[1] or box[1] > other[3]):
                    # Merge them
                    merged_box = [
                        min(box[0], other[0]), min(box[1], other[1]),
                        max(box[2], other[2]), max(box[3], other[3])
                    ]
                    expanded.pop(i)
                    expanded.append(merged_box)
                    overlap_found = True
                    merged = True
                    break
            if not overlap_found:
                new_boxes.append(box)
        expanded = new_boxes
        
    final_bboxes = []
    for b in expanded:
        # Remove padding and clamp to page
        x0 = max(0, b[0] + PADDING)
        top = max(0, b[1] + PADDING)
        x1 = min(page.width, b[2] - PADDING)
        bottom = min(page.height, b[3] - PADDING)
        
        w = x1 - x0
        h = bottom - top
        
        # Final Filters
        if w > 20 and h > 20: # Kill small artifacts
            if (w / h < 10.0) and (h / w < 10.0): # Kill full-page horizontal/vertical divider lines
                if w < page.width * 0.85 and h < page.height * 0.85: # Kill full-page text boxes
                    final_bboxes.append({"x0": x0, "top": top, "x1": x1, "bottom": bottom})
                    
    return final_bboxes

# ==========================================
# 3. THE AI BOUNCER
# ==========================================
def is_actual_diagram(pil_img):
    try:
        buffered = io.BytesIO()
        pil_img.save(buffered, format="PNG")
        base64_image = base64.b64encode(buffered.getvalue()).decode('utf-8')
    except Exception:
        return False

    prompt = """
    You are a strict Physics Diagram Validator. Your job is to filter out "fake" images that are actually just math equations or text.

    Look at the image and return a JSON object with one key: "is_diagram" (boolean).

    RETURN FALSE IF:
    1. The image shows ONLY multiple-choice options (e.g., "(A)", "(B)", "1)", "2)", "A.", "B.").
    2. The image is purely a mathematical equation, formula, matrix, or fraction (e.g., "F = ma", "v^2/R").
    3. The image is just a sentence or a block of text.

    RETURN TRUE ONLY IF:
    1. The image contains a physical illustration (e.g., blocks on a ramp, pulleys, strings, pendulums, circuits).
    2. The image contains a plotted math graph (with X and Y axes, curves, or data points).
    
    CRITICAL RULE: Size does not matter. Even if the drawing is very small or simple, if it represents a physical setup or graph, you MUST return TRUE. Be ruthless on math equations, but forgiving on actual drawings.
    """

    for attempt in range(2):
        try:
            response = client.chat.completions.create(
                model="pixtral-12b-2409",
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{base64_image}"}}
                        ]
                    }
                ],
                response_format={"type": "json_object"},
                temperature=0.0
            )
            result = json.loads(response.choices[0].message.content.strip())
            return result.get("is_diagram", False)
        except Exception as e:
            if "429" in str(e) or "rate_limit" in str(e):
                time.sleep(2)
                continue
            return True # Fallback to true if API acts up so we don't lose data
    return True

# ==========================================
# 4. JSON CLEANER
# ==========================================
def clean_existing_images(questions_list):
    """Scrubs the JSON clean of any old tags."""
    for q in questions_list:
        q["q"] = re.sub(r"\[IMG:.*?\]", "", q.get("q", "")).strip()
        q["explanation"] = re.sub(r"\[IMG:.*?\]", "", q.get("explanation", "")).strip()
        for i in range(len(q.get("options", []))):
            q["options"][i] = re.sub(r"\[IMG:.*?\]", "", q["options"][i]).strip()
    return questions_list

# ==========================================
# 5. MAIN INJECTION PIPELINE
# ==========================================
def perfect_filtered_crop_and_inject():
    if not os.path.exists(JSON_INPUT_PATH) or not os.path.exists(PDF_PATH):
        print("❌ Error: Could not find the JSON input or PDF file.")
        return

    try:
        with open(JSON_INPUT_PATH, "r", encoding="utf-8") as f:
            questions_list = json.load(f)
    except json.JSONDecodeError:
        print(f"❌ Error: {JSON_INPUT_PATH} contains invalid JSON.")
        return
    
    questions_list = clean_existing_images(questions_list)

    print("\n🔍 Scanning PDF for BOTH Vector Drawings and Raster Images...")
    pdf = pdfplumber.open(PDF_PATH)
    
    current_q_idx = -1
    in_solution = False
    global_img_counter = 1
    
    for page_num, page in enumerate(pdf.pages, start=1):
        elements = []
        
        # A. Get text lines
        lines = page.extract_text_lines()
        for line in lines:
            elements.append({"type": "text", "text": line["text"].strip(), "top": line["top"]})
            
        # B. Get COMBINED vector + raster bounding boxes
        diagram_bboxes = get_diagram_bboxes(page)
        for bbox in diagram_bboxes:
            elements.append({
                "type": "image", 
                "top": bbox["top"],
                "bbox": (bbox["x0"], bbox["top"], bbox["x1"], bbox["bottom"])
            })
                
        # C. Sort EVERYTHING geometrically
        elements.sort(key=lambda e: e["top"])
        
        # D. Process the page
        for el in elements:
            if el["type"] == "text":
                text = el["text"]
                if re.match(r"^Question\s*\d+", text, re.IGNORECASE):
                    current_q_idx += 1
                    in_solution = False
                elif re.match(r"^Solution", text, re.IGNORECASE):
                    in_solution = True
                    
            elif el["type"] == "image":
                if 0 <= current_q_idx < len(questions_list):
                    try:
                        # 1. CROP THE IMAGE
                        page_crop = page.crop(el["bbox"])
                        pil_img = page_crop.to_image(resolution=200).original 
                        
                        # 2. RUN IT THROUGH THE AI BOUNCER
                        print(f"   👁️ Checking visual cluster on Page {page_num}...", end="", flush=True)
                        is_diagram = is_actual_diagram(pil_img)
                        
                        if not is_diagram:
                            print(" ❌ Rejected (Math Equation / Text)")
                            continue 
                            
                        # 3. IT'S A REAL DIAGRAM: Save and Inject
                        img_name = f"{BASE_NAME}_img_{global_img_counter:03d}.png"
                        img_path = os.path.join(IMAGES_DIR, img_name)
                        pil_img.save(img_path, "PNG")
                        print(f" ✅ Real Diagram! Saved as {img_name}")
                        
                        if in_solution:
                            # Put image at the BEGINNING of the explanation
                            current_exp = questions_list[current_q_idx]["explanation"].strip()
                            questions_list[current_q_idx]["explanation"] = f"[IMG: {img_name}]\n\n{current_exp}"
                        else:
                            # Put image at the END of the question body
                            current_q = questions_list[current_q_idx]["q"].strip()
                            questions_list[current_q_idx]["q"] = f"{current_q}\n\n[IMG: {img_name}]"
                            
                        global_img_counter += 1
                        
                    except Exception as e:
                        print(f" ⚠️ Failed to process image: {e}")
                        continue

    # 5. SAVE TO A BRAND NEW JSON FILE
    with open(JSON_OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(questions_list, f, indent=2, ensure_ascii=False)
        
    print(f"\n🎉 SUCCESS! Filtered and saved {global_img_counter - 1} real diagrams!")

if __name__ == "__main__":
    perfect_filtered_crop_and_inject()