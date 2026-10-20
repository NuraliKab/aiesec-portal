# import io
# import requests
# import openpyxl

# #ID of the public spreadsheet
# SHEET_ID = "10Fb0P3NT3sjRtycyCM-_85xWVa1oavWTfCVddh-6bwY"

# #export Google Sheet as xlsx file
# EXPORT_URL = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=xlsx"

# def main():
#     print("Connecting to Google Sheets...")
#     response = requests.get(EXPORT_URL)
    
#     #check the response status code for errors
#     if response.status_code != 200:
#         print(f"Failed to download sheet. Status code: {response.status_code}")
#         return

#     print("Download complete. Parsing workbook in memory...")

#     excel = io.BytesIO(response.content)
#     wb = openpyxl.load_workbook(excel, data_only=True)

#     sheet = wb["Portugal🇵🇹"]

#     #finding the header row so first clean all data
#     header_row = None
#     header_row_index = None
#     for row_index, row in enumerate(sheet.iter_rows(values_only=True), start=1):
#         #convert values into string and make it uppercase and strip whitespace. 
#         row_cleaned = [str(cell).strip().upper() for cell in row if cell is not None]

#         if "OPPORTUNITY LINK" in row_cleaned and "PROJECT" in row_cleaned:
#             header_row = row
#             header_row_index = row_index
#             break


#     #iterate through data rows and print values
#     projects = []
#     for row in sheet.iter_rows(min_row=header_row_index + 1, values_only=True):
#         if not any(row):  #skip empty rows
#             continue
        
#         #couple the header name and the value for each project
#         project = {}
#         for col_name, cell_value in zip(header_row, row):
#             if col_name is not None:
#                 project[col_name] = cell_value
        
        
#         if project.get("OPPORTUNITY LINK") is not None:
#             projects.append(project)


#     print(projects)






# if __name__ == "__main__":
#     main()




import io
import json
import os
import requests
import openpyxl

# ID of the public spreadsheet
SHEET_ID = "10Fb0P3NT3sjRtycyCM-_85xWVa1oavWTfCVddh-6bwY"
EXPORT_URL = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=xlsx"

def main():
    print("Connecting to Google Sheets...")
    response = requests.get(EXPORT_URL)
    
    if response.status_code != 200:
        print(f"Failed to download sheet. Status code: {response.status_code}")
        return

    print("Download complete. Parsing workbook in memory...")
    excel = io.BytesIO(response.content)
    wb = openpyxl.load_workbook(excel, data_only=True)

    sheet = wb["Portugal🇵🇹"]

    # 1. Locate the header row
    header_row = None
    header_row_index = None
    for row_index, row in enumerate(sheet.iter_rows(values_only=True), start=1):
        row_cleaned = [str(cell).strip().upper() for cell in row if cell is not None]
        if "OPPORTUNITY LINK" in row_cleaned and "PROJECT" in row_cleaned:
            header_row = row
            header_row_index = row_index
            break

    if not header_row:
        print("Header row not found!")
        return

    # 2. Extract valid project rows
    projects = []
    for row in sheet.iter_rows(min_row=header_row_index + 1, values_only=True):
        # Stop immediately when reaching OUR EXPERIENCES
        row_text = " ".join(str(c).upper() for c in row if c is not None)
        if "OUR EXPERIENCES" in row_text:
            break

        # Skip completely empty rows
        if not any(row):
            continue

        project = {}
        for col_name, cell_value in zip(header_row, row):
            if col_name is not None:
                project[col_name] = cell_value

        # Only keep rows with real AIESEC opportunity links
        link = str(project.get("OPPORTUNITY LINK") or "").strip()
        if "aiesec.org" in link or link.startswith("http"):
            # Attach country/sheet metadata for the UI
            project["COUNTRY"] = "Portugal"
            project["FLAG"] = "🇵🇹"
            projects.append(project)

    print(f"Successfully extracted {len(projects)} valid projects!")

    # 3. Export directly to frontend/src/data/projects.json
    output_dir = os.path.join("frontend", "src", "data")
    os.makedirs(output_dir, exist_ok=True)
    output_path = os.path.join(output_dir, "projects.json")

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(projects, f, indent=2, ensure_ascii=False)

    print(f"Saved to: {output_path}")

if __name__ == "__main__":
    main()