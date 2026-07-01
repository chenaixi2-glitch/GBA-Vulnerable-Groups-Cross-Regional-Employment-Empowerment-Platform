"""
Test script for GBA Platform Backend API
Tests resume upload, optimization, and interview simulation workflows.

测试数据说明（统一存放于 test-data/）：
- Senior Full Stack Developer 场景：test-data/senior-fullstack/
- Alex Chen Mock 场景：test-data/alex-chen/
"""

import requests
import json
import time
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tests.fixtures.test_samples import (
    SAMPLE_PROFILE_TEXT,
    SAMPLE_JD_TEXT,
    GENERATE_RESUME_MESSAGE,
    INTERVIEW_START_MESSAGE,
    LEARNING_PATH_GAP_MESSAGE,
    LEARNING_PATH_TIMELINE_MESSAGE,
)

BASE_URL = "http://localhost:8000"
REQUEST_TIMEOUT = 300  # LLM workflows: single call ~60–90s, full pipeline up to ~3 min

def print_section(title):
    """Print a section header"""
    print("\n" + "="*60)
    print(f"  {title}")
    print("="*60)

def test_health_check():
    """Test 1: Health check endpoint"""
    print_section("TEST 1: Health Check")
    try:
        response = requests.get(f"{BASE_URL}/health", timeout=5)
        print(f"✓ Status Code: {response.status_code}")
        print(f"✓ Response: {response.json()}")
        return True
    except Exception as e:
        print(f"✗ Error: {e}")
        print("  → Backend server is not running!")
        print("  → Please start the backend with: python main.py")
        return False

def test_resume_workflow():
    """Test 2: Resume upload and optimization workflow"""
    print_section("TEST 2: Resume Upload & Optimization Workflow")
    
    session_id = None
    
    # Step 1: Upload resume (simulate profile extraction)
    print("\n[Step 1] Uploading resume and extracting profile...")
    try:
        payload = {
            "session_id": "",
            "message": SAMPLE_PROFILE_TEXT,
            "attachments": []
        }
        
        response = requests.post(
            f"{BASE_URL}/api/chat",
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=REQUEST_TIMEOUT
        )
        
        if response.status_code == 200:
            data = response.json()
            session_id = data.get("session_id")
            print(f"✓ Session ID: {session_id}")
            print(f"✓ Triggered Agents: {data.get('triggered_agents', [])}")
            print(f"✓ Reply Message: {data.get('reply_message', '')[:100]}...")
            
            # Check if profile was extracted
            if data.get("candidate_profile"):
                print("✓ Profile extracted successfully")
                profile = data["candidate_profile"]
                basic = profile.get("profile_basic") or {}
                print(f"  - Name: {basic.get('name', 'N/A')}")
                print(f"  - Facts: {len(profile.get('facts', []))} items")
            elif data.get("resume_content_json"):
                print("✓ Profile/resume content in response")
            else:
                print("⚠ Warning: No profile data in response")
        else:
            print(f"✗ Failed with status {response.status_code}")
            print(f"  Response: {response.text}")
            return False
            
    except Exception as e:
        print(f"✗ Error during resume upload: {e}")
        return False
    
    if not session_id:
        print("✗ No session ID received")
        return False
    
    # Step 2: Submit job description (JD analysis)
    print("\n[Step 2] Submitting job description for analysis...")
    try:
        jd_payload = {
            "session_id": session_id,
            "message": SAMPLE_JD_TEXT,
            "attachments": []
        }
        
        response = requests.post(
            f"{BASE_URL}/api/chat",
            json=jd_payload,
            headers={"Content-Type": "application/json"},
            timeout=REQUEST_TIMEOUT
        )
        
        if response.status_code == 200:
            data = response.json()
            print(f"✓ JD Analysis completed")
            print(f"✓ Triggered Agents: {data.get('triggered_agents', [])}")
            
            # Check for gaps
            gaps = data.get("gaps", [])
            if gaps:
                print(f"✓ Found {len(gaps)} skill gaps:")
                for i, gap in enumerate(gaps[:3], 1):
                    print(f"  {i}. {gap.get('description', 'N/A')[:80]}")
            else:
                print("⚠ No gaps identified")
        else:
            print(f"✗ Failed with status {response.status_code}")
            return False
            
    except Exception as e:
        print(f"✗ Error during JD analysis: {e}")
        return False
    
    # Step 3: Generate optimized resume
    print("\n[Step 3] Generating optimized resume...")
    try:
        generate_payload = {
            "session_id": session_id,
            "message": GENERATE_RESUME_MESSAGE,
            "attachments": []
        }
        
        response = requests.post(
            f"{BASE_URL}/api/chat",
            json=generate_payload,
            headers={"Content-Type": "application/json"},
            timeout=REQUEST_TIMEOUT
        )
        
        if response.status_code == 200:
            data = response.json()
            print(f"✓ Resume generation completed")
            print(f"✓ Triggered Agents: {data.get('triggered_agents', [])}")
            
            # Check for resume HTML
            if data.get("resume_html") and data["resume_html"].get("html"):
                html_length = len(data["resume_html"]["html"])
                print(f"✓ Resume HTML generated ({html_length} characters)")
                
                # Save preview to file
                with open("test_resume_preview.html", "w", encoding="utf-8") as f:
                    f.write(data["resume_html"]["html"])
                print("✓ Preview saved to: test_resume_preview.html")
            else:
                print("⚠ Warning: No resume HTML in response")
                
            # Check for reply message
            reply = data.get("reply_message", "")
            if reply:
                print(f"✓ AI Reply: {reply[:150]}...")
        else:
            print(f"✗ Failed with status {response.status_code}")
            print(f"  Response: {response.text[:200]}")
            return False
            
    except Exception as e:
        print(f"✗ Error during resume generation: {e}")
        return False
    
    print("\n✓ Resume workflow test PASSED")
    return True

def test_interview_workflow():
    """Test 3: Interview simulation workflow"""
    print_section("TEST 3: Interview Simulation Workflow")
    
    session_id = None
    
    # Step 1: Start interview session
    print("\n[Step 1] Starting interview session for Software Engineer position...")
    try:
        payload = {
            "session_id": "",
            "message": INTERVIEW_START_MESSAGE,
            "attachments": []
        }
        
        response = requests.post(
            f"{BASE_URL}/api/chat",
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=REQUEST_TIMEOUT
        )
        
        if response.status_code == 200:
            data = response.json()
            session_id = data.get("session_id")
            print(f"✓ Session ID: {session_id}")
            print(f"✓ Triggered Agents: {data.get('triggered_agents', [])}")
            
            # Check for interview questions
            interview_qa = data.get("interview_qa", [])
            if interview_qa:
                print(f"✓ Generated {len(interview_qa)} interview questions")
                for i, qa in enumerate(interview_qa[:3], 1):
                    print(f"\n  Question {i}:")
                    print(f"  Q: {qa.get('question', 'N/A')[:100]}...")
                    print(f"  Category: {qa.get('category', 'N/A')}")
            else:
                print("⚠ Warning: No interview questions generated")
        else:
            print(f"✗ Failed with status {response.status_code}")
            print(f"  Response: {response.text}")
            return False
            
    except Exception as e:
        print(f"✗ Error starting interview session: {e}")
        return False
    
    if not session_id:
        print("✗ No session ID received")
        return False
    
    # Step 2: Submit answer for evaluation
    print("\n[Step 2] Submitting answer for evaluation...")
    try:
        answer_payload = {
            "session_id": session_id,
            "message": "Evaluate my answer: I have 5 years of experience with Python and JavaScript. I led a team of 3 developers and implemented microservices architecture using Docker and Kubernetes. I'm passionate about clean code and mentoring junior developers.",
            "attachments": []
        }
        
        response = requests.post(
            f"{BASE_URL}/api/chat",
            json=answer_payload,
            headers={"Content-Type": "application/json"},
            timeout=REQUEST_TIMEOUT
        )
        
        if response.status_code == 200:
            data = response.json()
            print(f"✓ Answer evaluation completed")
            print(f"✓ Triggered Agents: {data.get('triggered_agents', [])}")
            
            # Check for feedback
            reply = data.get("reply_message", "")
            if reply:
                print(f"✓ Feedback: {reply[:200]}...")
            else:
                print("⚠ No feedback received")
        else:
            print(f"✗ Failed with status {response.status_code}")
            return False
            
    except Exception as e:
        print(f"✗ Error during answer evaluation: {e}")
        return False
    
    print("\n✓ Interview workflow test PASSED")
    return True

def test_learning_path_workflow():
    """Test 4: Learning path (gap analysis + timeline) workflow"""
    print_section("TEST 4: Learning Path Workflow")

    session_id = None

    print("\n[Step 1] Uploading profile from test-data/senior-fullstack/profile.txt...")
    try:
        response = requests.post(
            f"{BASE_URL}/api/chat",
            json={"session_id": "", "message": SAMPLE_PROFILE_TEXT, "attachments": []},
            headers={"Content-Type": "application/json"},
            timeout=REQUEST_TIMEOUT,
        )
        if response.status_code != 200:
            print(f"✗ Failed with status {response.status_code}: {response.text[:200]}")
            return False
        data = response.json()
        session_id = data.get("session_id")
        print(f"✓ Session ID: {session_id}")
        print(f"✓ Triggered Agents: {data.get('triggered_agents', [])}")
    except Exception as e:
        print(f"✗ Error during profile upload: {e}")
        return False

    if not session_id:
        print("✗ No session ID received")
        return False

    print("\n[Step 2] Submitting JD from test-data/senior-fullstack/jd.txt...")
    try:
        response = requests.post(
            f"{BASE_URL}/api/chat",
            json={"session_id": session_id, "message": SAMPLE_JD_TEXT, "attachments": []},
            headers={"Content-Type": "application/json"},
            timeout=REQUEST_TIMEOUT,
        )
        if response.status_code != 200:
            print(f"✗ Failed with status {response.status_code}: {response.text[:200]}")
            return False
        data = response.json()
        gaps = data.get("gaps", [])
        print(f"✓ JD analysis completed; {len(gaps)} gap(s) identified")
        for i, gap in enumerate(gaps[:3], 1):
            print(f"  {i}. {gap.get('description', 'N/A')[:80]}")
    except Exception as e:
        print(f"✗ Error during JD analysis: {e}")
        return False

    print("\n[Step 3] Running skill gap analysis + resource recommendations...")
    try:
        response = requests.post(
            f"{BASE_URL}/api/chat",
            json={"session_id": session_id, "message": LEARNING_PATH_GAP_MESSAGE, "attachments": []},
            headers={"Content-Type": "application/json"},
            timeout=REQUEST_TIMEOUT,
        )
        if response.status_code != 200:
            print(f"✗ Failed with status {response.status_code}: {response.text[:200]}")
            return False
        data = response.json()
        resources = data.get("resources", [])
        print(f"✓ Triggered Agents: {data.get('triggered_agents', [])}")
        print(f"✓ Recommended {len(resources)} learning resource(s)")
        print(f"✓ Estimated total hours: {data.get('estimated_total_hours', 0)}")
        for i, res in enumerate(resources[:3], 1):
            print(f"  {i}. {res.get('title', 'N/A')[:60]} ({res.get('platform', 'N/A')})")
    except Exception as e:
        print(f"✗ Error during gap analysis: {e}")
        return False

    print("\n[Step 4] Generating learning timeline (2 hours/day)...")
    try:
        response = requests.post(
            f"{BASE_URL}/api/chat",
            json={"session_id": session_id, "message": LEARNING_PATH_TIMELINE_MESSAGE, "attachments": []},
            headers={"Content-Type": "application/json"},
            timeout=REQUEST_TIMEOUT,
        )
        if response.status_code != 200:
            print(f"✗ Failed with status {response.status_code}: {response.text[:200]}")
            return False
        data = response.json()
        timeline = data.get("timeline", [])
        print(f"✓ Triggered Agents: {data.get('triggered_agents', [])}")
        print(f"✓ Generated {len(timeline)} timeline phase(s)")
        print(f"✓ Daily hours: {data.get('daily_hours', 0)}")
        for phase in timeline[:3]:
            print(f"  Phase {phase.get('phase')}: {phase.get('title', 'N/A')} ({phase.get('weeks', 'N/A')})")
        if not timeline:
            print("⚠ Warning: No timeline phases generated")
    except Exception as e:
        print(f"✗ Error during timeline generation: {e}")
        return False

    print("\n✓ Learning path workflow test PASSED")
    return True

def main():
    """Run all tests"""
    print("\n" + "🚀"*30)
    print("  GBA Platform Backend API Test Suite")
    print("🚀"*30)
    
    results = {}
    
    # Test 1: Health Check
    results["Health Check"] = test_health_check()
    
    if not results["Health Check"]:
        print("\n" + "❌"*30)
        print("  Backend is not running. Aborting further tests.")
        print("  Please start the backend with: python main.py")
        print("❌"*30 + "\n")
        return
    
    time.sleep(1)
    
    # Test 2: Resume Workflow
    results["Resume Workflow"] = test_resume_workflow()
    
    time.sleep(1)
    
    # Test 3: Interview Workflow
    results["Interview Workflow"] = test_interview_workflow()

    time.sleep(1)

    # Test 4: Learning Path Workflow
    results["Learning Path Workflow"] = test_learning_path_workflow()
    
    # Print summary
    print_section("TEST SUMMARY")
    for test_name, passed in results.items():
        status = "✅ PASSED" if passed else "❌ FAILED"
        print(f"{test_name:.<50} {status}")
    
    total = len(results)
    passed = sum(1 for v in results.values() if v)
    
    print("\n" + "="*60)
    print(f"Total: {passed}/{total} tests passed")
    print("="*60)
    
    if passed == total:
        print("\n🎉 All tests passed! Backend is working correctly.")
    else:
        print(f"\n⚠️  {total - passed} test(s) failed. Check the errors above.")
    
    print("\n")

if __name__ == "__main__":
    main()
