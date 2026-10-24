# 🛕 Temple Contribution & Records Manager

A clean, fast, and simple website to store and manage place names, people's names under each place, contact details, and the contribution/donation amount given by each person.

Built with **Node.js** and **SQLite** for **permanent local storage**.

---

## ✨ Features

1. **Add Place Names**: Create places, villages, or streets (e.g., *North Street*, *Madurai*, *Gandhi Nagar*).
2. **Add People's Names Under Each Place**: Enter each contributor's name directly under their place.
3. **Mobile Number & Address Details**:
   - Save each person's mobile phone number (with one-click click-to-call link).
   - Save their door number, street, or address notes.
4. **Date & Time Tracking**: Automatically records the exact date and time (or pick a custom date & time when recording or editing).
5. **Record Amounts**: Enter amounts in Indian Rupees (₹) with automatic totals and currency formatting.
6. **Permanent Storage**: All records are saved in a durable SQLite database (`temple_records.db`). Data is never lost on refresh, browser close, or computer restart.
7. **View Saved Data Anytime**: Clear, organized table view displaying serial number, place, person's name, phone number, address, amount, and date/time.
8. **Edit Existing Details**: Update any place name, person's name, mobile number, address, or amount with one click.
9. **Delete Records**: Delete individual contributor records or entire places with safe confirmation prompts.
10. **Live Search & Quick Filters**: Search instantly across person name, place, phone number, or address.
11. **Works on Both Mobile Phones and Laptops**: Responsive card layout on mobile phones and full table view on laptops.
12. **Export to Excel / CSV**: Download a complete spreadsheet backup anytime with all fields (S.No, Place, Name, Phone, Address, Amount, Date & Time).

---

## 🚀 How to Run the Website

### Method 1: One-Click Start (Windows)
Double-click the **`start.bat`** file in this folder.
- It will automatically launch the server and open the website in your default browser at `http://localhost:3000`.

---

### Method 2: From Terminal / Command Prompt
Open a terminal in this folder (`temple app`) and run:

```bash
node server.js
```

Then open your browser and go to:
```
http://localhost:3000
```

---

## 📱 How to Use on Your Mobile Phone

1. Connect your mobile phone to the **same Wi-Fi network** as your laptop.
2. The terminal displays your mobile access address:
   ```
   Mobile access: http://<your-ip>:3000 (on same Wi-Fi)
   ```
3. Open Chrome or Safari on your phone and enter that address.
4. You can tap on any phone number to call directly, add new contributors, and manage records on the go!

---

## 💾 Where Is the Data Saved?

All data is permanently stored in **`temple_records.db`** in this folder.
- Safe across reboots, refreshes, and browser restarts.
- Click **"Export CSV"** anytime to download a spreadsheet report for Excel or Google Sheets.
