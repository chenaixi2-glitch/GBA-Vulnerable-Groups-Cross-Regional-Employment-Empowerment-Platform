# Backend Testing Guide

## Prerequisites

Before testing the backend, ensure you have:

1. **Redis Server** running on port 6379
2. **MySQL Server** running with database `ai_career_copilot`
3. **API Keys** configured in environment variables:
   - `DEEPSEEK_API_KEY` - For LLM (DeepSeek)
   - `DASHSCOPE_API_KEY` - For embeddings and reranking
   - `MYSQL_PASSWORD` - MySQL root password
   - `LANGCHAIN_API_KEY` - For LangSmith tracing (optional)

## Setup Environment Variables

Create a `.env` file in the `backend/` directory:

```bash
DEEPSEEK_API_KEY=your_deepseek_api_key_here
DASHSCOPE_API_KEY=your_dashscope_api_key_here
MYSQL_PASSWORD=your_mysql_password_here
LANGCHAIN_API_KEY=your_langchain_api_key_here
```

## Running Tests

### Option 1: Test Backend Health Only

```bash
cd backend
python test_api.py
```

This will check if the backend is running and responsive.

### Option 2: Start Backend Server

```bash
cd backend
python main.py
```

Expected output:
```
INFO: Checking MySQL connectivity before startup
INFO: MySQL connectivity check passed
INFO: Checking Redis connectivity before startup
INFO: Redis connectivity check passed
INFO: Starting AI Career Copilot server on 0.0.0.0:8000
```

Then in another terminal, run the test:
```bash
cd backend
python test_api.py
```

### Option 3: Quick Health Check with curl

```bash
curl http://localhost:8000/health
```

Expected response:
```json
{"status": "ok"}
```

## Test Coverage

The test script (`test_api.py`) validates:

### ✅ Test 1: Health Check
- Backend server is running
- API endpoint is accessible

### ✅ Test 2: Resume Workflow
1. **Profile Extraction** - Upload resume text, trigger `profile_agent`
2. **JD Analysis** - Submit job description, trigger `jd_agent` + `gap_agent`
3. **Resume Generation** - Generate optimized resume, trigger `content_agent` + `render_agent`
4. **Output Validation** - Check for generated HTML resume

### ✅ Test 3: Interview Workflow
1. **Question Generation** - Start interview session, trigger `interview_agent`
2. **Answer Evaluation** - Submit answer, trigger `question_agent`
3. **Feedback Validation** - Check for AI feedback

## Expected Test Results

```
🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀
  GBA Platform Backend API Test Suite
🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀

============================================================
  TEST 1: Health Check
============================================================
✓ Status Code: 200
✓ Response: {'status': 'ok'}

============================================================
  TEST 2: Resume Upload & Optimization Workflow
============================================================

[Step 1] Uploading resume and extracting profile...
✓ Session ID: sess_xxxxxxxxxxxxxxxx
✓ Triggered Agents: ['profile_agent']
✓ Reply Message: Resume analyzed successfully...
✓ Profile extracted successfully
  - Name: John Doe
  - Skills: 8 skills found

[Step 2] Submitting job description for analysis...
✓ JD Analysis completed
✓ Triggered Agents: ['jd_agent', 'gap_agent']
✓ Found 2 skill gaps:
  1. Cloud platform experience needs improvement
  2. Team leadership experience should be highlighted

[Step 3] Generating optimized resume...
✓ Resume generation completed
✓ Triggered Agents: ['content_agent', 'render_agent']
✓ Resume HTML generated (5432 characters)
✓ Preview saved to: test_resume_preview.html
✓ AI Reply: I've generated an optimized resume tailored for the Senior Full Stack Developer position...

✓ Resume workflow test PASSED

============================================================
  TEST 3: Interview Simulation Workflow
============================================================

[Step 1] Starting interview session for Software Engineer position...
✓ Session ID: sess_yyyyyyyyyyyyyyyy
✓ Triggered Agents: ['interview_agent']
✓ Generated 5 interview questions

  Question 1:
  Q: Can you describe your experience with microservices architecture?...
  Category: Technical

  Question 2:
  Q: How do you approach mentoring junior developers?...
  Category: Leadership

[Step 2] Submitting answer for evaluation...
✓ Answer evaluation completed
✓ Triggered Agents: ['question_agent']
✓ Feedback: Your answer demonstrates relevant experience. Consider adding specific metrics...

✓ Interview workflow test PASSED

============================================================
  TEST SUMMARY
============================================================
Health Check.......................................... ✅ PASSED
Resume Workflow....................................... ✅ PASSED
Interview Workflow.................................... ✅ PASSED

============================================================
Total: 3/3 tests passed
============================================================

🎉 All tests passed! Backend is working correctly.
```

## Troubleshooting

### Issue: "Backend server is not running"

**Solution:**
```bash
cd backend
python main.py
```

### Issue: "Connection refused" or timeout

**Check:**
1. Backend is running on port 8000
2. No firewall blocking localhost connections
3. Redis and MySQL are running

### Issue: "MySQL connectivity check failed"

**Solution:**
1. Ensure MySQL is running
2. Create database: `CREATE DATABASE ai_career_copilot CHARACTER SET utf8mb4;`
3. Set `MYSQL_PASSWORD` environment variable

### Issue: "Redis connectivity check failed"

**Solution:**
1. Start Redis server: `redis-server`
2. Verify Redis is running: `redis-cli ping` (should return PONG)

### Issue: "API key not found" errors

**Solution:**
Set required environment variables in `.env` file or system environment.

### Issue: LLM API errors

**Check:**
1. API keys are valid
2. API quotas are not exceeded
3. Network connection to API providers

## Manual Testing with Frontend

After backend passes all tests:

1. **Start Backend:**
   ```bash
   cd backend
   python main.py
   ```

2. **Start Frontend:**
   ```bash
   cd frontend-new
   node static-server.js
   ```

3. **Open Browser:**
   - Portal: http://localhost:3000/individual/portal.html
   - Resume Generator: http://localhost:3000/individual/demo-resume-generator.html
   - Interview Prep: http://localhost:3000/individual/demo-interview.html
   - Learning Path: http://localhost:3000/individual/demo-learning-path.html

4. **Test Features:**
   - Upload a resume file or paste text
   - Enter a job description
   - Generate customized resume
   - Start interview session
   - Answer questions and get feedback
   - Generate learning path

## Viewing Generated Files

After running tests, check these files:

- `backend/test_resume_preview.html` - Generated resume preview
- Backend logs in `backend/log/` directory
- Redis session data (use `redis-cli` to inspect)
- MySQL database tables (use MySQL client to query)

## Next Steps

If all tests pass:
1. ✅ Backend is ready for production use
2. ✅ Frontend can integrate with real APIs
3. ✅ All agents are functioning correctly

If tests fail:
1. Check error messages in test output
2. Review backend logs
3. Verify environment configuration
4. Ensure all dependencies are installed

---

**Last Updated:** January 2024
**Version:** 1.0.0
