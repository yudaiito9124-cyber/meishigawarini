import os
import re

doc_dir = "/Users/yudai/git/meishigawarini/documents"
md_files = [f for f in os.listdir(doc_dir) if f.endswith('.md')]

broken_links = []

# Pattern to find markdown links [text](path)
# Group 2 is the path
link_pattern = re.compile(r'\[([^\]]+)\]\(([^)]+)\)')

def get_headings(file_path):
    headings = set()
    if not os.path.exists(file_path):
        return headings
    with open(file_path, 'r', encoding='utf-8') as f:
        for line in f:
            match = re.match(r'^(#+)\s+(.+)$', line)
            if match:
                # Basic anchor generation: lower case, replace spaces with -
                # This is a bit simplistic but works for most Github-style anchors
                title = match.group(2).strip()
                anchor = title.lower().replace(' ', '-').replace('(', '').replace(')', '').replace('：', '').replace(':', '').replace('.', '').replace('編', '').replace('編', '')
                # More robust: remove non-alphanumeric except - and _
                # But let's keep it simple first
                headings.add(anchor)
    return headings

for md_file in md_files:
    file_path = os.path.join(doc_dir, md_file)
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
        
        # Remove code blocks and inline code to avoid false positives
        content_clean = re.sub(r'```.*?```', '', content, flags=re.DOTALL)
        content_clean = re.sub(r'`[^`]+`', '', content_clean)
        
        links = link_pattern.findall(content_clean)
        
        for text, path in links:
            if path.startswith('http') or path.startswith('mailto:'):
                continue
            
            # Split path and fragment
            parts = path.split('#')
            rel_path = parts[0]
            fragment = parts[1] if len(parts) > 1 else None
            
            if rel_path == "" or rel_path == ".":
                # Link within the same file or current dir (same file if fragment exists)
                target_file = file_path
            else:
                # Handle ./ or ../ (though usually it's ./ in this project)
                target_file = os.path.normpath(os.path.join(doc_dir, rel_path))
            
            if not os.path.exists(target_file):
                broken_links.append({
                    "src": md_file,
                    "text": text,
                    "target": path,
                    "reason": "File not found"
                })
            # Special case: check fragments (optional but good)
            # elif fragment:
            #     headings = get_headings(target_file)
            #     if fragment not in headings:
            #         # This is prone to false positives due to complex slugification
            #         pass 

if broken_links:
    print("Found broken links:")
    for bl in broken_links:
        print(f"File: {bl['src']} | Text: {bl['text']} | Path: {bl['target']} | {bl['reason']}")
else:
    print("All file-links are valid.")
