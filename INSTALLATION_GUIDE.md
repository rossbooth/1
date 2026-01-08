# Installation Guide for Non-Coders
## How to Get the Franchise Data Scraper Running on Your Computer

This guide assumes you have no coding experience. Just follow these steps exactly!

---

## 🎯 What You'll Be Able To Do

Once installed, you'll:
- Open the app in your web browser (like opening any website)
- Drag and drop FDD PDF files to extract data
- See beautiful charts and graphs
- Search for FDD sources online
- Export data to Excel/CSV

---

## 📋 Step 1: Install Python (5 minutes)

Python is the programming language the app uses. You need it installed on your computer.

### For Windows:

1. **Download Python**
   - Go to: https://www.python.org/downloads/
   - Click the big yellow "Download Python" button
   - This downloads a file called something like `python-3.12.0-amd64.exe`

2. **Install Python**
   - Double-click the downloaded file
   - **IMPORTANT**: Check the box that says "Add Python to PATH" ✅
   - Click "Install Now"
   - Wait for it to finish
   - Click "Close"

3. **Verify It Worked**
   - Press `Windows Key + R`
   - Type: `cmd` and press Enter
   - A black window opens (this is the "Command Prompt")
   - Type: `python --version` and press Enter
   - You should see something like: `Python 3.12.0`
   - If you see this, Python is installed! ✅

### For Mac:

1. **Download Python**
   - Go to: https://www.python.org/downloads/
   - Click "Download Python 3.12.x"
   - This downloads a `.pkg` file

2. **Install Python**
   - Double-click the downloaded `.pkg` file
   - Follow the installation wizard
   - Click through until it's done

3. **Verify It Worked**
   - Press `Cmd + Space` to open Spotlight
   - Type: `terminal` and press Enter
   - A window opens (this is the "Terminal")
   - Type: `python3 --version` and press Enter
   - You should see something like: `Python 3.12.0`
   - If you see this, Python is installed! ✅

---

## 📥 Step 2: Download the Code (2 minutes)

You need to get the Franchise Data Scraper code onto your computer.

### Option A: Download as ZIP (Easiest - Recommended)

1. **Get the Repository URL**
   - You're working on branch: `claude/franchise-data-scraper-hieVG`
   - Ask your contact for the GitHub repository link
   - Or if you have access to the repo, click the green "Code" button
   - Click "Download ZIP"

2. **Extract the ZIP**
   - Find the downloaded ZIP file (usually in your Downloads folder)
   - Right-click on it
   - Choose "Extract All..." (Windows) or just double-click (Mac)
   - Choose where to extract (Desktop is easy to find)
   - You'll now have a folder called something like `franchise-data-scraper-main`

### Option B: Using Git (If you're familiar with it)

If you have Git installed:
```bash
git clone <your-repository-url>
cd franchise-data-scraper
git checkout claude/franchise-data-scraper-hieVG
```

---

## 🔧 Step 3: Install the App (3 minutes)

Now we need to install the app's dependencies (the tools it needs to run).

### For Windows:

1. **Open the Folder**
   - Find the folder you extracted (probably on your Desktop)
   - Right-click on an empty space in the folder
   - Hold `Shift` and right-click
   - Choose "Open PowerShell window here" or "Open Command Prompt here"

2. **Install Dependencies**
   - A window opens with text
   - Type this command exactly:
   ```
   pip install -r requirements.txt
   ```
   - Press Enter
   - Wait (this takes 1-2 minutes)
   - You'll see lots of text scrolling - this is normal!
   - When it's done, you'll see a new prompt

### For Mac:

1. **Open Terminal in the Folder**
   - Open the folder you extracted
   - Right-click on the folder
   - Choose "Services" → "New Terminal at Folder"
   - OR: Open Terminal and type: `cd ` (with a space), then drag the folder into the Terminal window

2. **Install Dependencies**
   - In the Terminal window, type:
   ```
   pip3 install -r requirements.txt
   ```
   - Press Enter
   - Wait (this takes 1-2 minutes)
   - You'll see lots of text scrolling - this is normal!

---

## 🚀 Step 4: Start the App (1 minute)

### For Windows:

1. **In the same Command Prompt/PowerShell window from Step 3**, type:
   ```
   python app.py
   ```
   - Press Enter

2. **You'll see text appear** that ends with something like:
   ```
   * Running on http://127.0.0.1:5000
   ```

3. **The app is now running!** ✅
   - Keep this window open - if you close it, the app stops

### For Mac:

1. **In the same Terminal window from Step 3**, type:
   ```
   python3 app.py
   ```
   - Press Enter

2. **You'll see text appear** that ends with something like:
   ```
   * Running on http://127.0.0.1:5000
   ```

3. **The app is now running!** ✅
   - Keep this window open - if you close it, the app stops

---

## 🌐 Step 5: Open the App in Your Browser

1. **Open your web browser** (Chrome, Firefox, Safari, Edge - any will work)

2. **In the address bar, type**:
   ```
   http://localhost:5000
   ```
   - Press Enter

3. **You should see the Franchise Data Scraper website!** 🎉

---

## 📱 Using the App

### Dashboard (Home Page)
- **See all processed franchises** in cards
- **View statistics** at the top (total franchises, average fees, etc.)
- **Click on a franchise card** to see full details
- **Process PDFs**: Click "Process All PDFs" if you have files in the `data` folder
- **Export data**: Click CSV, JSON, or Excel to download

### Upload Page
- **Click the "Upload" link** in the navigation
- **Drag and drop PDF files** onto the upload area
- OR **click "Select Files"** to browse for PDFs
- The app automatically processes them and extracts data!
- After upload, you'll be redirected to the dashboard

### Search Page
- **Click the "Search FDDs" link** in the navigation
- **Type a franchise name** (like "Jersey Mike's")
- **Click "Search FDD Sources"**
- You'll get links to:
  - Wisconsin State Database (FREE)
  - California DBO (FREE)
  - Minnesota Commerce (FREE)
  - And paid services
- **Click on the links** to visit those sites and download FDDs

### Visualize Page
- **Click the "Visualize" link** in the navigation
- **See interactive charts** comparing:
  - Initial investments
  - Fee structures
  - Franchise system sizes
  - Financial performance
- **Hover over charts** for details
- **Charts only work if you have processed some FDDs first**

---

## ❓ Common Issues & Solutions

### "Command not found" or "Python is not recognized"

**Problem**: Python isn't installed correctly or not in your PATH.

**Solution**:
- Reinstall Python
- **IMPORTANT**: During installation, check "Add Python to PATH"
- Restart your computer after installing

### "No module named 'flask'" or similar errors

**Problem**: Dependencies didn't install correctly.

**Solution**:
- Close the Command Prompt/Terminal
- Open a new one in the app folder
- Run the install command again:
  - Windows: `pip install -r requirements.txt`
  - Mac: `pip3 install -r requirements.txt`

### "Address already in use" or "Port 5000 is already in use"

**Problem**: Something else is using port 5000, or the app is already running.

**Solution**:
- Check if you have another Command Prompt/Terminal window open with the app running
- Close all Command Prompt/Terminal windows
- Try again

### "This site can't be reached" when opening localhost:5000

**Problem**: The app isn't running.

**Solution**:
- Make sure you ran `python app.py` (or `python3 app.py` on Mac)
- Check that the Command Prompt/Terminal window is still open
- Look for the message "Running on http://127.0.0.1:5000"

### The app is slow or freezing

**Problem**: Processing large PDFs can take time.

**Solution**:
- This is normal for large files
- Wait a bit - processing a 150-page FDD can take 30 seconds
- The page will update when it's done

---

## 🛑 Stopping the App

When you're done using the app:

1. **Go to the Command Prompt/Terminal window** where the app is running
2. **Press `Ctrl + C`** (Windows/Mac)
3. The app stops
4. Close the window

To use the app again later:
- Just run `python app.py` (or `python3 app.py`) again!

---

## 🎓 Quick Tutorial: Processing Your First FDD

Let's process Jersey Mike's FDD as an example:

### Step 1: Get the FDD
1. Open the app: `http://localhost:5000`
2. Click "Search FDDs" in the navigation
3. Type "Jersey Mike's" and click Search
4. Click on "Wisconsin State Database" link
5. Download the Jersey Mike's FDD PDF to your computer

### Step 2: Upload the FDD
1. In the app, click "Upload" in the navigation
2. Drag the Jersey Mike's PDF you just downloaded onto the upload area
3. Wait while it processes (you'll see progress)
4. When done, click "Dashboard" or it redirects automatically

### Step 3: View the Data
1. You'll see a card with Jersey Mike's information
2. Click on the card to see full details
3. Click "Export CSV" to download an Excel file with all the data

### Step 4: Visualize
1. Click "Visualize" in the navigation
2. See charts showing the investment breakdown
3. Process more FDDs to compare multiple franchises!

---

## 📞 Getting Help

If you get stuck:

1. **Check the error message** in the Command Prompt/Terminal window
2. **Google the error message** - often someone else has solved it
3. **Make sure Python is installed**: Type `python --version` (or `python3 --version`)
4. **Make sure you're in the right folder**: The Command Prompt/Terminal should show the franchise-data-scraper folder path

---

## 🎉 You're All Set!

Once you complete these steps, you'll have:
- ✅ A working web application on your computer
- ✅ The ability to drag-and-drop FDD PDFs
- ✅ Automatic data extraction
- ✅ Beautiful visualizations
- ✅ Excel/CSV export capabilities
- ✅ FDD search functionality

**Remember**:
- Keep the Command Prompt/Terminal window open while using the app
- The app only runs on YOUR computer - it's private and secure
- Your data stays on your computer - nothing is uploaded to the internet

Enjoy analyzing franchise data! 🚀
