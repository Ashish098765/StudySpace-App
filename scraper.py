import undetected_chromedriver as uc
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException
from bs4 import BeautifulSoup
import json
import os
import re
import time

def setup_driver():
    options = uc.ChromeOptions()
    options.add_argument("--headless=new")
    options.page_load_strategy = 'eager' 
    
    # Block heavy assets to significantly speed up scraping
    prefs = {
        "profile.managed_default_content_settings.images": 2,
        "profile.managed_default_content_settings.stylesheets": 2,
        "profile.managed_default_content_settings.fonts": 2,
        "profile.default_content_setting_values.notifications": 2
    }
    options.add_experimental_option("prefs", prefs)
    
    driver = uc.Chrome(options=options, version_main=148)
    driver.__class__.__del__ = lambda self: None # Suppress WinError 6
    return driver

def scrape_chapters():
    chapters_to_scrape = {
        "https://questions.examside.com/past-years/jee/jee-main/physics/units-and-measurements": "public/data/questions/jee_phy_units.json"
    }
    
    os.makedirs('public/data/questions', exist_ok=True)
    print("--- BOOTING UP THE JAVASCRIPT MATH ENGINE v4 ---")
    driver = setup_driver()
    
    try:
        for chapter_url, output_file in chapters_to_scrape.items():
            print(f"\n{'='*60}")
            print(f"STARTING: {output_file}")
            
            driver.get(chapter_url)
            
            WebDriverWait(driver, 10).until(EC.presence_of_element_located((By.TAG_NAME, "body")))
            
            print("Scrolling to extract all links (Bypassing Lazy Load)...")
            last_height = driver.execute_script("return document.body.scrollHeight")
            while True:
                driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
                time.sleep(1.2) 
                new_height = driver.execute_script("return document.body.scrollHeight")
                if new_height == last_height:
                    break 
                last_height = new_height
            
            all_links = driver.find_elements(By.TAG_NAME, "a")
            question_links = list(set([l.get_attribute("href") for l in all_links if l.get_attribute("href") and "/past-years/jee/question/" in l.get_attribute("href")]))
            
            if len(question_links) > 0:
                print(f"Found {len(question_links)} unique questions in this chapter.\n")
            else:
                print("No questions found. Skipping chapter.")
                continue
            
            all_data = []
            
            for i, link in enumerate(question_links):
                success = False
                last_error = ""
                
                for attempt in range(3): # 3 Retries per question for network stability
                    try:
                        driver.get(link)
                        wait = WebDriverWait(driver, 6)
                        
                        wait.until(EC.presence_of_element_located((By.CLASS_NAME, "question-component")))
                        time.sleep(0.5) 
                        
                        # Click option to trigger answer layout (if MCQ)
                        options_buttons = driver.find_elements(By.CSS_SELECTOR, "div[role='button']")
                        if len(options_buttons) > 0:
                            driver.execute_script("arguments[0].click();", options_buttons[0])
                        
                        # Click Check/Show Answer
                        buttons = driver.find_elements(By.TAG_NAME, "button")
                        for btn in buttons:
                            if "check" in btn.text.lower() or "show" in btn.text.lower():
                                driver.execute_script("arguments[0].click();", btn)
                                break
                        
                        # Wait for API Explanation/Answer
                        try:
                            WebDriverWait(driver, 4).until(
                                lambda d: "Correct Answer" in d.page_source or "Explanation" in d.page_source
                            )
                        except TimeoutException:
                            pass 
                        
                        time.sleep(0.5) 
                        
                        # ==========================================
                        # THE JAVASCRIPT MATH FLATTENER v4
                        # Aggressive attribute extraction for MathJax 3
                        # ==========================================
                        js_math_flattener = """
                        // 1. MathJax v3 (<mjx-container>)
                        document.querySelectorAll('mjx-container').forEach(mjx => {
                            let tex = mjx.getAttribute('aria-label') || '';
                            if (!tex) {
                                let mathNode = mjx.querySelector('math');
                                if (mathNode) tex = mathNode.getAttribute('alttext') || '';
                            }
                            if (!tex) {
                                let mml = mjx.querySelector('annotation[encoding="application/x-tex"]');
                                if (mml) tex = mml.textContent || mml.innerText;
                            }
                            if (!tex) {
                                let prev = mjx.previousElementSibling;
                                if (prev && prev.tagName === 'SCRIPT' && prev.type.includes('math/tex')) {
                                    tex = prev.textContent || prev.innerText;
                                    prev.remove();
                                }
                            }
                            if (tex) {
                                let isDisplay = mjx.hasAttribute('display') && mjx.getAttribute('display') === 'true';
                                let wrapper = isDisplay ? ' $$' + tex.trim() + '$$ ' : ' $' + tex.trim() + '$ ';
                                mjx.insertAdjacentText('beforebegin', wrapper);
                            }
                            mjx.remove();
                        });

                        // 2. Examside Image Fallbacks (Sometimes they use SVGs with TeX in the alt attribute)
                        document.querySelectorAll('img').forEach(img => {
                            let alt = img.getAttribute('alt') || '';
                            if (alt && (alt.includes('\\\\') || alt.includes('^') || alt.includes('_'))) {
                                img.insertAdjacentText('beforebegin', ' $' + alt.trim() + '$ ');
                                img.remove(); // Remove image only if we successfully grabbed math
                            }
                        });

                        // 3. KaTeX
                        document.querySelectorAll('.katex').forEach(katex => {
                            let mml = katex.querySelector('annotation[encoding="application/x-tex"]');
                            if (mml) {
                                let tex = mml.textContent || mml.innerText;
                                let isDisplay = katex.parentNode && katex.parentNode.classList.contains('katex-display');
                                let wrapper = isDisplay ? ' $$' + tex.trim() + '$$ ' : ' $' + tex.trim() + '$ ';
                                katex.insertAdjacentText('beforebegin', wrapper);
                            }
                            katex.remove();
                        });

                        // 4. MathJax v2
                        document.querySelectorAll('.MathJax').forEach(mj => {
                            let next = mj.nextElementSibling;
                            if (next && next.tagName === 'SCRIPT' && next.type.includes('math/tex')) {
                                let tex = next.textContent || next.innerText;
                                let isDisplay = next.type.includes('display');
                                let wrapper = isDisplay ? ' $$' + tex.trim() + '$$ ' : ' $' + tex.trim() + '$ ';
                                mj.insertAdjacentText('beforebegin', wrapper);
                                next.remove();
                            }
                            mj.remove();
                        });

                        // 5. Leftover raw scripts
                        document.querySelectorAll('script[type^="math/tex"]').forEach(script => {
                            let tex = script.textContent || script.innerText;
                            let isDisplay = script.type.includes('display');
                            let wrapper = isDisplay ? ' $$' + tex.trim() + '$$ ' : ' $' + tex.trim() + '$ ';
                            script.insertAdjacentText('beforebegin', wrapper);
                            script.remove();
                        });

                        // 6. Visual junk sweep
                        document.querySelectorAll('.MathJax_Preview').forEach(el => el.remove());
                        """
                        driver.execute_script(js_math_flattener)
                        # ==========================================
                        
                        soup = BeautifulSoup(driver.page_source, 'html.parser')
                        container = soup.find('div', class_='question-component')
                        
                        if not container:
                            raise ValueError("React Hydration Failed")

                        # Extract Q Text
                        q_div = container.find('div', class_='question')
                        q_text = q_div.get_text(separator=" ", strip=True) if q_div else "Question text missing"
                        
                        raw_options = container.find_all('div', role='button')
                        options_text = []
                        correct_answers = []
                        
                        if len(raw_options) > 0:
                            for idx, opt in enumerate(raw_options):
                                raw_text = opt.get_text(separator=" ", strip=True)
                                if "Correct Answer" in raw_text: correct_answers.append(idx)
                                clean_text = " ".join(raw_text.replace("Correct Answer", "").replace("Wrong Answer", "").strip().split())
                                
                                # Strip A, B, C, D prefixes if they are followed by space/punctuation
                                clean_text = re.sub(r'^([A-D])[\.\)\s]+', '', clean_text).strip()
                                
                                # If the option literally just says "A" (because the math failed), don't append a useless letter
                                if clean_text in ["A", "B", "C", "D"]:
                                    clean_text = "Data Missing"
                                    
                                if clean_text: options_text.append(clean_text)
                            
                            if len(correct_answers) == 1:
                                correct_index = correct_answers[0]
                            elif len(correct_answers) > 1:
                                correct_index = correct_answers
                            else:
                                correct_index = "N/A"
                        else:
                            num_ans_match = re.search(r'Correct Answer\s*:?\s*(-?\d+\.?\d*)', container.text, re.IGNORECASE)
                            if num_ans_match: 
                                correct_index = num_ans_match.group(1)
                            else:
                                correct_index = "N/A"

                        explanation = "No Explanation Available"
                        exp_headers = container.find_all(['h2', 'h3', 'strong', 'div'], string=re.compile(r'Explanation', re.IGNORECASE))
                        for header in exp_headers:
                            sibling = header.find_next_sibling('div')
                            if sibling:
                                explanation = sibling.get_text(separator="\n", strip=True)
                                break

                        body_text = soup.get_text(" ")
                        year, exact_date, shift = "Unknown Year", "Unknown Date", "Unknown Shift"
                        
                        match = re.search(r'(20[0-2]\d)\s*\(\s*(\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+)\s*(Shift\s*\d|Morning|Evening)\s*\)', body_text, re.IGNORECASE)
                        if match:
                            year = match.group(1)
                            clean_day = re.sub(r'(st|nd|rd|th)', '', match.group(2), flags=re.IGNORECASE).strip().title()
                            exact_date = f"{clean_day} {year}"
                            shift = match.group(3).title()
                        else:
                            year_match = re.search(r'\b(20[0-2]\d)\b', body_text)
                            if year_match: year = year_match.group(1)
                            
                            date_match = re.search(r'\b(\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]{3,})\b', body_text)
                            if date_match and year != "Unknown Year":
                                clean_day = re.sub(r'(st|nd|rd|th)', '', date_match.group(1), flags=re.IGNORECASE).strip().title()
                                exact_date = f"{clean_day} {year}"
                            else:
                                exact_date = year
                                
                            shift_match = re.search(r'\b(Shift\s*\d|Morning|Evening)\b', body_text, re.IGNORECASE)
                            if shift_match: shift = shift_match.group(1).title()
                        
                        all_data.append({
                            "q": q_text, 
                            "options": options_text, 
                            "answer": correct_index, 
                            "explanation": explanation,
                            "date": exact_date, 
                            "year": year,
                            "shift": shift
                        })
                        
                        print(f"\rScraping Progress: [{i+1}/{len(question_links)}] completed...", end="", flush=True)
                        success = True
                        break 
                        
                    except Exception as e:
                        last_error = str(e).split('\n')[0]
                        time.sleep(1.5) 
                        continue 

                if not success:
                    print(f"\n[!] Skipped question {i+1} after 3 attempts. Error: {last_error}")

            print("\nSaving to JSON...")
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(all_data, f, indent=4, ensure_ascii=False)
            
            print(f"SUCCESS! Saved {len(all_data)} questions to {output_file}")

    finally:
        print("\n--- CLOSING BROWSER ---")
        try:
            driver.quit()
        except Exception:
            pass
        print("--- SCRIPT FINISHED SUCCESSFULLY ---")

if __name__ == "__main__":
    scrape_chapters()