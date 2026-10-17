import io
import requests
import openpyxl

# ID of the public spreadsheet
SHEET_ID = "10Fb0P3NT3sjRtycyCM-_85xWVa1oavWTfCVddh-6bwY"

# Export Google Sheet as xlsx file
EXPORT_URL = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=xlsx"

def main():
    print("Connecting to Google Sheets...")
    response = requests.get(EXPORT_URL)
    
    # Check the response status code for errors
    if response.status_code != 200:
        print(f"Failed to download sheet. Status code: {response.status_code}")
        return

    print("Download complete. Parsing workbook in memory...")

    excel = io.BytesIO(response.content)
    wb = openpyxl.load_workbook(excel, data_only=True)
    print(wb.sheetnames)


if __name__ == "__main__":
    main()