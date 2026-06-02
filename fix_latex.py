
import json
import re
import os

def fix_string(s):
    if not s:
        return s
    
    # 1. Fix image tags: Remove ALL $ inside [IMG: ... ]
    def clean_img(match):
        return match.group(0).replace('$', '')
    
    s = re.sub(r'\[IMG: [^\]]+\]', clean_img, s)
    
    # 2. Fix nested/redundant $ signs
    # Fix $$$ or more -> $$
    s = re.sub(r'\${3,}', '$$', s)
    
    # Fix .$$ at the end of sentences
    s = s.replace('.$$', '.')
    s = s.replace('?$$', '?')
    s = s.replace('!$$', '!')
    
    # Fix the pattern where the whole string was wrapped in $ but it already had math
    if s.startswith('$') and s.endswith('$') and not s.startswith('$$'):
        if s[1:-1].count('$') > 0:
            s = s[1:-1]
            
    if s.startswith('$$') and s.endswith('$$'):
        if s[2:-2].count('$$') > 0:
            s = s[2:-2]
    
    # Fix specific corrupted patterns identified
    s = s.replace('the acceleration of the particle is $2(c + $c_0$)$', 'the acceleration of the particle is $2(c + c_0)$')
    s = s.replace('the acceleration of the particle is $2c_0$', 'the acceleration of the particle is $2c_0$')
    
    return s

def walk_any(obj):
    if isinstance(obj, list):
        return [walk_any(x) for x in obj]
    elif isinstance(obj, dict):
        return {k: walk_any(v) for k, v in obj.items()}
    elif isinstance(obj, str):
        return fix_string(obj)
    else:
        return obj

def process_file(path):
    print(f"Processing {path}...")
    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    new_data = walk_any(data)
    
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(new_data, f, indent=4, ensure_ascii=False)

paths = [
    r'C:\Users\HP\OneDrive\Desktop\MERA\StudySpace\public\data\questions\jee_phy_kinematics.json',
    r'C:\Users\HP\OneDrive\Desktop\MERA\StudySpace\public\data\questions\jee_phy_physical_world_units.json'
]

for p in paths:
    if os.path.exists(p):
        process_file(p)
    else:
        print(f"File not found: {p}")

print("Done.")
