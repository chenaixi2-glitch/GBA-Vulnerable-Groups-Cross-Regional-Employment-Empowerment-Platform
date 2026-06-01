# Quick Start Guide - GBA Platform New Frontend

## 🚀 Getting Started in 3 Steps

### Step 1: Start the Backend Server

Open a terminal and navigate to the backend directory:

```bash
cd backend
python main.py
```

You should see output like:
```
INFO:     Starting AI Career Copilot server on 0.0.0.0:8000
INFO:     Checking MySQL connectivity before startup
INFO:     MySQL connectivity check passed
INFO:     Checking Redis connectivity before startup
INFO:     Redis connectivity check passed
```

**Keep this terminal running!**

### Step 2: Start the Frontend Server

Open a **new terminal** and navigate to the new frontend directory:

```bash
cd frontend-new
node static-server.js
```

You should see a nice banner with all available URLs.

### Step 3: Open in Browser

Navigate to: **http://localhost:3000/individual/portal.html**

You're ready to go! 🎉

---

## 📁 Project Structure

```
frontend-new/
├── individual/
│   ├── portal.html                    # Main entry point
│   ├── demo-resume-generator.html     # Smart resume builder
│   ├── demo-interview.html            # Interview preparation
│   ├── demo-learning-path.html        # Learning path planner
│   └── assets/
│       ├── js/
│       │   ├── api-client.js          # Core API client
│       │   ├── app.js                 # Portal page logic
│       │   ├── resume-generator.js    # Resume generator logic
│       │   ├── interview-prep.js      # Interview prep logic
│       │   └── learning-path.js       # Learning path logic
│       └── css/                       # (Future custom styles)
├── corporate/                         # (Not implemented yet)
├── static-server.js                   # Node.js static server
└── README.md                          # Full documentation
```

---

## 🎯 Feature Overview

### 1. Smart Resume Generator

**URL:** http://localhost:3000/individual/demo-resume-generator.html

**What it does:**
- Upload your current resume (PDF/DOCX/TXT)
- Paste target job description
- AI analyzes skill gaps
- Generates customized resume
- Download as HTML or export as PDF/DOCX

**Backend Agents Used:**
- Profile Agent → Extracts your skills
- JD Agent → Analyzes job requirements
- Gap Analysis Agent → Identifies missing skills
- Content Agent → Writes optimized content
- Render Agent → Formats the resume

### 2. Interview Preparation

**URL:** http://localhost:3000/individual/demo-interview.html

**What it does:**
- Enter target job title
- Choose interviewer tone (Professional/Friendly/Pressure)
- Answer AI-generated questions
- Get instant feedback
- Download session report

**Backend Agents Used:**
- Interview Agent → Generates personalized questions
- Question Agent → Evaluates your answers

### 3. Learning Path Planner

**URL:** http://localhost:3000/individual/demo-learning-path.html

**What it does:**
- Define your career goal
- List current skills
- AI creates learning roadmap
- Shows timeline and resources
- Download complete plan

**Backend Agents Used:**
- Gap Analysis Agent → Identifies skill gaps
- Content Agent → Recommends resources

---

## 🔧 Troubleshooting

### Problem: "Backend server not running"

**Solution:**
```bash
cd backend
python main.py
```

Make sure you see: `Starting AI Career Copilot server on 0.0.0.0:8000`

### Problem: "Cannot connect to API"

**Check:**
1. Backend is running on port 8000
2. No firewall blocking localhost connections
3. Redis and MySQL are running (required by backend)

### Problem: Page not loading

**Solution:**
```bash
# Make sure you're in the right directory
cd frontend-new

# Start the server
node static-server.js
```

Then open: http://localhost:3000/individual/portal.html

### Problem: Session not working

**Solution:**
- Clear browser cache
- Try incognito/private mode
- Check browser console for errors (F12)

---

## 🧪 Testing the Integration

### Test 1: Health Check

Open browser console (F12) and run:

```javascript
await apiClient.healthCheck()
```

Expected output: `{status: "ok"}`

### Test 2: Generate Session ID

```javascript
apiClient.generateSessionId()
```

Expected output: `"sess_xxxxxxxxxxxxxxxx"`

### Test 3: Check Session Persistence

```javascript
// Generate session
apiClient.generateSessionId()

// Reload page

// Check if session persists
apiClient.loadSessionId()
```

Should return the same session ID.

---

## 📝 Example Workflow: Generate a Resume

1. **Open Resume Generator**
   - Go to: http://localhost:3000/individual/demo-resume-generator.html

2. **Upload Resume**
   - Click upload area or drag & drop a file
   - Or paste resume text in the textarea
   - Click "Continue to Step 2"

3. **Enter Job Description**
   - Paste the full job description
   - Select industry and experience level
   - Click "Generate Customized Resume"

4. **Watch AI Work**
   - See real-time agent status updates
   - Profile Agent → JD Agent → Gap Agent → Content Agent → Render Agent

5. **Review Results**
   - View generated resume
   - Check skill gap analysis
   - Download or export

---

## 💡 Tips for Best Experience

1. **Use Modern Browsers**
   - Chrome, Firefox, Safari, or Edge (latest versions)

2. **Keep Backend Running**
   - Don't close the backend terminal while using the frontend

3. **Check Console for Debugging**
   - Press F12 to open developer tools
   - Watch the Console tab for errors

4. **Use Sample Data First**
   - Test with simple resume text before uploading files
   - Use short job descriptions initially

5. **Monitor Network Tab**
   - In browser DevTools, check Network tab
   - Verify API calls are succeeding (status 200)

---

## 🆘 Need Help?

### Check These First:

1. **Browser Console** (F12 → Console tab)
   - Look for error messages
   - Check API response data

2. **Backend Terminal**
   - Look for error logs
   - Verify requests are being received

3. **Network Tab** (F12 → Network tab)
   - Check if API calls are being made
   - Verify response status codes

### Common Error Messages:

- **"Network error"** → Backend not running
- **"Resource not found"** → Invalid session ID
- **"Server error"** → Backend crashed, check logs
- **"Invalid request"** → Check input data format

---

## 🎓 Next Steps

After testing the basic features:

1. **Explore All Pages**
   - Try all three demo pages
   - Test different inputs and scenarios

2. **Customize UI**
   - Modify Tailwind classes in HTML
   - Add custom CSS in `assets/css/`

3. **Extend Functionality**
   - Add new pages following the pattern
   - Create new API endpoints in backend

4. **Deploy**
   - Configure production backend URL
   - Set up proper web server (Nginx/Apache)
   - Enable HTTPS

---

## 📚 Additional Resources

- **Full Documentation:** See `README.md` in this directory
- **Backend API Docs:** Check backend documentation
- **Tailwind CSS:** https://tailwindcss.com/docs
- **Axios:** https://axios-http.com/docs

---

**Happy Building! 🚀**
