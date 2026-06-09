import os
import json
import re
import io
import base64
import time
import logging
import pdfplumber
from PIL import Image
from openai import OpenAI

# --- Silence the annoying PDFMiner FontBBox warnings ---
logging.getLogger("pdfminer").setLevel(logging.ERROR)

# ==========================================
# 1. CONFIGURE YOUR SETTINGS
# ==========================================
client = OpenAI(api_key="5gtXDBiyIZxKQRFU18jZzepkzW7eLKSM", base_url="https://api.mistral.ai/v1")

PDF_PATH = os.path.abspath("./raw_pdfs/jee_phy_nlom.pdf")
JSON_INPUT_PATH = os.path.abspath("./nlom.json") 
JSON_OUTPUT_PATH = os.path.abspath("./nlm_FINAL_WITH_IMAGES.json")
IMAGES_DIR = os.path.abspath("./extracted_images")
BASE_NAME = "jee_phy_nlom"

os.makedirs(IMAGES_DIR, exist_ok=True)

# ==========================================
# 2. VECTOR + RASTER CLUSTERING ENGINE
# ==========================================
def get_diagram_bboxes(page):
    valid_boxes = []
    
    for img in page.images:
        valid_boxes.append([img['x0'], img['top'], img['x1'], img['bottom']])
        
    for v in page.lines + page.curves + page.rects:
        w = v['x1'] - v['x0']
        h = v['bottom'] - v['top']
        if w > 10 or h > 10: 
            valid_boxes.append([v['x0'], v['top'], v['x1'], v['bottom']])
            
    if not valid_boxes: return []
        
    # CRITICAL FIX 1: Increased PADDING to 20. 
    # Diagram elements (like detached arrows or labels) drawn far apart will now snap together into one image.
    PADDING = 20  
    expanded = [[b[0]-PADDING, b[1]-PADDING, b[2]+PADDING, b[3]+PADDING] for b in valid_boxes]
    
    merged = True
    while merged:
        merged = False
        new_boxes = []
        while expanded:
            box = expanded.pop(0)
            overlap_found = False
            for i, other in enumerate(expanded):
                if not (box[2] < other[0] or box[0] > other[2] or box[3] < other[1] or box[1] > other[3]):
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
        x0 = max(0, b[0] + PADDING)
        top = max(0, b[1] + PADDING)
        x1 = min(page.width, b[2] - PADDING)
        bottom = min(page.height, b[3] - PADDING)
        
        w = x1 - x0
        h = bottom - top
        
        if w > 20 and h > 20: 
            if (w / h < 10.0) and (h / w < 10.0): 
                if w < page.width * 0.85 and h < page.height * 0.85: 
                    final_bboxes.append({"x0": x0, "top": top, "x1": x1, "bottom": bottom})
                    
    return final_bboxes

# ==========================================
# 3. THE BULLETPROOF AI BOUNCER
# ==========================================
def is_actual_diagram(pil_img):
    try:
        buffered = io.BytesIO()
        pil_img.save(buffered, format="PNG")
        base64_image = base64.b64encode(buffered.getvalue()).decode('utf-8')
    except Exception:
        return False

    prompt = """
    You are a physics teacher. Look at this image cropped from an exam paper.
    Does this image contain a physical diagram, a plotted graph, a circuit, or a drawing of an object?
    If it DOES contain a drawing or graph, reply with exactly the word YES.
    If it is ONLY a mathematical equation, a fraction, or standard text, reply with exactly the word NO.
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
                temperature=0.0 
            )
            result = response.choices[0].message.content.strip().upper()
            return "YES" in result
            
        except Exception as e:
            if "429" in str(e) or "rate_limit" in str(e):
                print(" [API Throttled - Waiting 3s...]", end="")
                time.sleep(3)
                continue
            print(f" [API Error: {e}]", end="")
            return False 
    return False

def clean_existing_images(questions_list):
    for q in questions_list:
        q["q"] = re.sub(r"\[IMG:.*?\]", "", q.get("q", "")).strip()
        q["explanation"] = re.sub(r"\[IMG:.*?\]", "", q.get("explanation", "")).strip()
        for i in range(len(q.get("options", []))):
            q["options"][i] = re.sub(r"\[IMG:.*?\]", "", q["options"][i]).strip()
    return questions_list

# ==========================================
# 4. MAIN INJECTION PIPELINE
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

    print(f"\n🔍 Scanning {BASE_NAME}.pdf for Diagrams and Option Images...")
    pdf = pdfplumber.open(PDF_PATH)
    
    current_q_idx = -1
    in_solution = False
    current_option_idx = -1 
    global_img_counter = 1
    
    for page_num, page in enumerate(pdf.pages, start=1):
        elements = []
        
        lines = page.extract_text_lines()
        for line in lines:
            elements.append({"type": "text", "text": line["text"].strip(), "top": line["top"]})
            
        diagram_bboxes = get_diagram_bboxes(page)
        for bbox in diagram_bboxes:
            elements.append({
                "type": "image", 
                "top": bbox["top"],
                "bbox": (bbox["x0"], bbox["top"], bbox["x1"], bbox["bottom"])
            })
                
        elements.sort(key=lambda e: e["top"])
        
        for el in elements:
            if el["type"] == "text":
                text = el["text"]
                
                if re.match(r"^(Question|Q)[\s\.]*\d+", text, re.IGNORECASE):
                    current_q_idx += 1
                    in_solution = False
                    current_option_idx = -1 
                    
                elif re.match(r"^(Solution|Ans)", text, re.IGNORECASE):
                    in_solution = True
                    current_option_idx = -1 
                    
                elif not in_solution:
                    opt_match = re.match(r"^[\(]?([A-Da-d1-4])[\.\)]", text)
                    if opt_match:
                        val = str(opt_match.group(1)).upper()
                        if val in ['A', '1']: current_option_idx = 0
                        elif val in ['B', '2']: current_option_idx = 1
                        elif val in ['C', '3']: current_option_idx = 2
                        elif val in ['D', '4']: current_option_idx = 3
                    
            elif el["type"] == "image":
                if 0 <= current_q_idx < len(questions_list):
                    try:
                        w = el["bbox"][2] - el["bbox"][0]
                        h = el["bbox"][3] - el["bbox"][1]
                        
                        if w < 25 or h < 25:
                            continue
                            
                        page_crop = page.crop(el["bbox"])
                        words_inside = page_crop.extract_words()
                        
                        # CRITICAL FIX 2: Relaxed word count. Complex physics diagrams have many labels.
                        if len(words_inside) > 30:
                            continue 
                            
                        text_inside = " ".join([w["text"].strip() for w in words_inside]).lower()
                        is_obvious_text = False
                        aspect_ratio = w / h if h > 0 else 0
                        
                        if "statement" in text_inside or "option" in text_inside:
                            is_obvious_text = True
                            
                        # CRITICAL FIX 3: Tighter aspect ratio math trap. 
                        # Only reject as math if it's exceptionally wide (>3.5 ratio) or very short (<40px)
                        if aspect_ratio > 3.5 or h < 40:
                            if re.match(r"^[\(]?[a-d1-4][\.\)]\s", text_inside):
                                is_obvious_text = True
                            
                            math_keywords = ['=', '\\', 'sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'alpha', 'beta', 'theta', 'mu', 'gamma']
                            if len(words_inside) <= 10 and any(m in text_inside for m in math_keywords):
                                is_obvious_text = True
                                
                        if is_obvious_text:
                            continue

                        # CRITICAL FIX 4: Relaxed Area Ratio to 30%.
                        # Real paragraphs easily exceed 60% density. 30% allows for diagrams with heavy text labeling.
                        text_area = sum((word["x1"] - word["x0"]) * (word["bottom"] - word["top"]) for word in words_inside)
                        crop_area = w * h
                        
                        if crop_area > 0 and (text_area / crop_area) > 0.30:
                            continue

                        pil_img = page_crop.to_image(resolution=200).original 
                        print(f"   👁️ AI Checking potential diagram on Page {page_num}...", end="", flush=True)
                        is_diagram = is_actual_diagram(pil_img)
                        
                        if not is_diagram:
                            print(" ❌ Rejected")
                            continue 
                            
                        img_name = f"{BASE_NAME}_img_{global_img_counter:03d}.png"
                        img_path = os.path.join(IMAGES_DIR, img_name)
                        pil_img.save(img_path, "PNG")
                        
                        dest_str = "Question"
                        if in_solution:
                            dest_str = "Solution"
                            current_exp = questions_list[current_q_idx].get("explanation", "").strip()
                            questions_list[current_q_idx]["explanation"] = f"[IMG: {img_name}]\n\n{current_exp}"
                            
                        elif current_option_idx != -1:
                            dest_str = f"Option {chr(65+current_option_idx)}"
                            options_list = questions_list[current_q_idx].get("options", [])
                            if current_option_idx < len(options_list):
                                current_opt = options_list[current_option_idx].strip()
                                options_list[current_option_idx] = f"{current_opt}\n\n[IMG: {img_name}]"
                            else:
                                current_q_text = questions_list[current_q_idx].get("q", "").strip()
                                questions_list[current_q_idx]["q"] = f"{current_q_text}\n\n[IMG: {img_name}]"
                                
                        else:
                            current_q_text = questions_list[current_q_idx].get("q", "").strip()
                            questions_list[current_q_idx]["q"] = f"{current_q_text}\n\n[IMG: {img_name}]"
                            
                        print(f" ✅ Saved as {img_name} -> Injected into {dest_str}")
                        global_img_counter += 1
                        
                    except Exception as e:
                        print(f" ⚠️ Failed to process image box: {e}")
                        continue

    with open(JSON_OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(questions_list, f, indent=2, ensure_ascii=False)
        
    print(f"\n🎉 SUCCESS! Filtered, mapped, and saved {global_img_counter - 1} real diagrams!")

if __name__ == "__main__":
    perfect_filtered_crop_and_inject()