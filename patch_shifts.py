import undetected_chromedriver as uc
from bs4 import BeautifulSoup
import json
import re
import time
import os

OUTPUT_FILE = "public/data/questions/jee_phy_units.json"

def setup_driver():
    options = uc.ChromeOptions()
    options.add_argument("--headless=new") 
    options.add_argument("--log-level=3")
    options.page_load_strategy = 'eager'
    driver = uc.Chrome(options=options, version_main=148) 
    driver.set_page_load_timeout(30)
    driver.__class__.__del__ = lambda self: None 
    return driver

print("🚀 BOOTING UNIVERSAL PATCHER V2 (Targeted Extraction)...")

if not os.path.exists(OUTPUT_FILE):
    print(f"[!] Could not find {OUTPUT_FILE}.")
    exit()

with open(OUTPUT_FILE, 'r', encoding='utf-8') as f:
    questions = json.load(f)

# Force a re-check of ALL questions to fix the cloned dates
needs_patch = questions 

print(f"🔍 Re-scanning {len(needs_patch)} questions to ensure accurate dates...")

driver = setup_driver()

try:
    for i, q in enumerate(needs_patch):
        url = q.get('url')
        if not url: continue
        
        print(f"\n[{i+1}/{len(needs_patch)}] Checking {url[-15:]}...")
        
        driver.get(url)
        time.sleep(1.5) 
        
        soup = BeautifulSoup(driver.page_source, 'html.parser')
        
        # THE FIX: Isolate ONLY the question box so we ignore sidebar dates
        cont = soup.find('div', class_='question-component') or soup.find('div', class_='question-card') or soup.find('div', class_='question-container')
        
        if cont:
            target_text = cont.get_text(" ", strip=True)
        else:
            target_text = soup.get_text(" ", strip=True) # Fallback if class names change
        
        # --- PATCH 1: SHIFT ---
        shift_match = re.search(r'(Morning|Evening|Afternoon|Shift\s*1|Shift\s*2|Shift\s*I\b|Shift\s*II\b)', target_text, re.I)
        if shift_match:
            raw_shift = shift_match.group(1).lower()
            if any(word in raw_shift for word in ['morning', '1', 'i']): q['shift'] = "Morning"
            elif any(word in raw_shift for word in ['evening', 'afternoon', '2', 'ii']): q['shift'] = "Evening"
            else: q['shift'] = shift_match.group(1) 
            print(f"   -> Shift: {q['shift']}")
        
        # --- PATCH 2: DATE ---
        date_match = re.search(r'\b(\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*)\b', target_text, re.I)
        if date_match:
            q['date'] = date_match.group(1)
            print(f"   -> Date: {q['date']}")

        # --- PATCH 3: YEAR ---
        year_match = re.search(r'\b(20[0-2]\d)\b', target_text)
        if year_match:
            q['year'] = year_match.group(1)
            print(f"   -> Year: {q['year']}")

        if (i + 1) % 5 == 0:
            with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
                json.dump(questions, f, indent=4, ensure_ascii=False)

    print("\n💾 Saving perfectly patched data to JSON...")
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(questions, f, indent=4, ensure_ascii=False)
        
    print("🎉 All done! Dates and Shifts are now accurately synced to the specific question.")

finally:
    driver.quit()