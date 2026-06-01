# GBA Platform - New Frontend (Individual Portal)

## Overview

This is the new frontend implementation for the GBA Cross-Border Employment Empowerment Platform, designed to integrate with the real backend AI Career Copilot system.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    GBA Platform Frontend                     │
│  (HTML5 + Vanilla JS + Tailwind CSS + Axios)                │
├─────────────────────────────────────────────────────────────┤
│  individual/portal.html          →  Main entry point         │
│  ├── demo-resume-generator.html  →  Smart resume builder     │
│  ├── demo-interview.html         →  Interview preparation    │
│  └── demo-learning-path.html     →  Learning path planner    │
└──────────────────────┬──────────────────────────────────────┘
                       │ Axios HTTP Requests
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              AI Career Copilot Backend                       │
│  (FastAPI + LangGraph Multi-Agent System)                   │
├─────────────────────────────────────────────────────────────┤
│  POST /api/chat          →  Unified agent orchestration      │
│  GET  /api/resume/html   →  Retrieve resume HTML             │
│  POST /api/resume/render →  Re-render resume                 │
│  POST /api/export        →  Export resume (PDF/DOCX)         │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                   Data Layer                                 │
│  Redis (Session State) + MySQL (Persistent Storage)          │
└─────────────────────────────────────────────────────────────┘
```

## Features

### 1. Smart Resume Generator (`demo-resume-generator.html`)

**Purpose:** Generate customized resumes based on user profile and target job description.

**Agent Integration:**
- **Profile Agent:** Extracts and structures candidate information from uploaded resume
- **JD Agent:** Analyzes job description requirements
- **Gap Analysis Agent:** Identifies skill gaps between candidate and job requirements
- **Content Agent:** Generates optimized resume content
- **Render Agent:** Formats and styles the resume

**User Flow:**
1. Upload resume (PDF/DOCX/TXT) or paste text
2. Paste target job description
3. Select industry and experience level
4. Click "Generate Customized Resume"
5. View generated resume with gap analysis
6. Download as HTML or export as PDF/DOCX

### 2. Interview Preparation (`demo-interview.html`)

**Purpose:** Practice interviews with AI-generated questions tailored to target role.

**Agent Integration:**
- **Interview Agent:** Generates personalized interview questions based on job title and industry
- **Question Agent:** Evaluates user answers and provides feedback

**Features:**
- Three interviewer tones: Professional, Friendly, High Pressure
- Real-time answer evaluation
- Detailed feedback with strengths and improvement areas
- Session progress tracking
- Downloadable session report

**User Flow:**
1. Enter target job title and company
2. Select interviewer tone
3. Click "Start Interview Session"
4. Answer questions one by one
5. Receive instant AI feedback
6. Complete session and download report

### 3. Personalized Learning Path (`demo-learning-path.html`)

**Purpose:** Create customized learning roadmap to bridge skill gaps.

**Agent Integration:**
- **Gap Analysis Agent:** Identifies required skills vs current skills
- **Content Agent:** Curates learning resources

**Features:**
- Skill gap visualization
- Timeline-based learning phases
- Curated resource recommendations (courses, articles, videos, projects)
- Progress tracking
- Downloadable learning plan

**User Flow:**
1. Enter target job title and current role
2. List current skills
3. Select timeline (3/6/12 months)
4. Click "Generate My Learning Path"
5. View skill gaps, timeline, and resources
6. Download complete learning plan

## Setup Instructions

### Prerequisites

1. **Backend Server Running**
   ```bash
   cd backend
   python main.py
   ```
   The backend should be running on `http://localhost:8000`

2. **Modern Web Browser**
   - Chrome, Firefox, Safari, or Edge (latest versions)

### Running the Frontend

#### Option 1: Using Node.js Static Server

```bash
cd frontend-new
node static-server.js
```

Then open: `http://localhost:3000/individual/portal.html`

#### Option 2: Using Python HTTP Server

```bash
cd frontend-new
python -m http.server 3000
```

Then open: `http://localhost:3000/individual/portal.html`

#### Option 3: Direct File Access (Limited Functionality)

Open `frontend-new/individual/portal.html` directly in browser.

**Note:** CORS restrictions may prevent API calls when opening files directly. Use a local server for full functionality.

## Configuration

### API Endpoint Configuration

Edit `assets/js/api-client.js`:

```javascript
const API_CONFIG = {
    BASE_URL: 'http://localhost:8000/api',  // Change if backend runs on different host/port
    TIMEOUT: 30000,                          // Request timeout in milliseconds
};
```

### Session Management

Sessions are automatically managed using `localStorage`:
- Session ID is persisted across page reloads
- Users can start new sessions or continue existing ones
- Clear session data using the "Clear Data" button on portal

## API Integration Details

### Main Chat Endpoint

All agent interactions go through the unified `/api/chat` endpoint:

```javascript
// Example: Upload resume
const response = await apiClient.uploadResume(file);

// Example: Submit job description
const response = await apiClient.submitJobDescription(jdText);

// Example: Generate resume
const response = await apiClient.generateResume();

// Example: Start interview session
const response = await apiClient.startInterviewSession(jobTitle, industry, tone);

// Example: Generate learning path
const response = await apiClient.generateLearningPath(targetJob, currentSkills, timeline);
```

### Response Structure

Typical response from `/api/chat`:

```json
{
  "session_id": "sess_abc123",
  "reply_message": "Resume analyzed successfully",
  "job": { ... },
  "gaps": [ ... ],
  "questions_to_ask": [ ... ],
  "resume_content_json": { ... },
  "resume_html": { "html": "<div>...</div>" },
  "interview_qa": [ ... ],
  "triggered_agents": ["profile_agent", "jd_agent", "gap_agent"]
}
```

## Error Handling

The API client includes comprehensive error handling:

- **Network Errors:** Detects when backend is unreachable
- **Server Errors:** Handles 4xx and 5xx HTTP status codes
- **Validation Errors:** Provides user-friendly messages for invalid input
- **Timeout Errors:** Alerts users when requests take too long

Error messages are displayed via toast notifications.

## Browser Compatibility

| Browser | Version | Status |
|---------|---------|--------|
| Chrome | 90+ | ✅ Fully Supported |
| Firefox | 88+ | ✅ Fully Supported |
| Safari | 14+ | ✅ Fully Supported |
| Edge | 90+ | ✅ Fully Supported |

## Development Guidelines

### Code Style

- Use ES6+ JavaScript features
- Follow async/await pattern for API calls
- Use meaningful variable and function names
- Add comments for complex logic

### Adding New Features

1. Create new HTML page in `individual/` directory
2. Create corresponding JavaScript file in `assets/js/`
3. Use `apiClient` for all backend communication
4. Use `Utils` for common UI operations (toast, loading, etc.)
5. Update navigation in `portal.html`

### Testing

Test each feature with:
1. Backend running normally
2. Backend stopped (error handling)
3. Invalid input data
4. Network interruptions

## Troubleshooting

### "Backend server not running" message

**Solution:** Start the backend server:
```bash
cd backend
python main.py
```

### CORS errors

**Solution:** Ensure backend CORS middleware is enabled (already configured in `backend/main.py`)

### Session not persisting

**Solution:** Check browser localStorage is enabled and not in private/incognito mode

### API calls failing

**Solution:** 
1. Verify backend is running on correct port
2. Check browser console for detailed error messages
3. Verify API endpoint configuration in `api-client.js`

## Future Enhancements

- [ ] Add WebSocket support for real-time agent status updates
- [ ] Implement offline mode with service workers
- [ ] Add multi-language support (i18n)
- [ ] Integrate analytics and usage tracking
- [ ] Add user authentication and profiles
- [ ] Implement A/B testing framework

## Support

For issues or questions:
- Check browser console for error details
- Review backend logs
- Refer to API documentation
- Contact development team

## License

This project is part of the GBA Cross-Border Employment Empowerment Platform initiative.

---

**Last Updated:** 2024-01-15
**Version:** 1.0.0
