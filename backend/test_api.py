"""
Test script for GBA Platform Backend API
Tests resume upload, optimization, and interview simulation workflows
"""

import requests
import json
import time

BASE_URL = "http://localhost:8000"

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
            "message": """
John Doe
Email: john.doe@example.com
Phone: +86 138-0000-0000

EXPERIENCE:
Senior Software Engineer at Tech Corp (2020-Present)
- Led development of microservices architecture
- Implemented CI/CD pipelines using Docker and Kubernetes
- Mentored junior developers and conducted code reviews

SKILLS:
Python, JavaScript, React, Node.js, Docker, Kubernetes, AWS, Git

EDUCATION:
Bachelor of Science in Computer Science
University of Technology, 2019
            """,
            "attachments": []
        }
        
        response = requests.post(
            f"{BASE_URL}/api/chat",
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=30
        )
        
        if response.status_code == 200:
            data = response.json()
            session_id = data.get("session_id")
            print(f"✓ Session ID: {session_id}")
            print(f"✓ Triggered Agents: {data.get('triggered_agents', [])}")
            print(f"✓ Reply Message: {data.get('reply_message', '')[:100]}...")
            
            # Check if profile was extracted
            if data.get("resume_content_json"):
                print("✓ Profile extracted successfully")
                profile = data["resume_content_json"]
                print(f"  - Name: {profile.get('basic', {}).get('name', 'N/A')}")
                print(f"  - Skills: {len(profile.get('skills', []))} skills found")
            else:
                print("⚠ Warning: No resume content in response")
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
            "message": """
Job Title: Senior Full Stack Developer

Requirements:
- 5+ years of experience in web development
- Strong proficiency in Python and JavaScript
- Experience with React and Node.js
- Knowledge of containerization (Docker, Kubernetes)
- Cloud platform experience (AWS/Azure/GCP)
- Excellent problem-solving skills
- Team leadership experience

Responsibilities:
- Design and implement scalable web applications
- Lead technical architecture decisions
- Mentor junior developers
- Collaborate with cross-functional teams
            """,
            "attachments": []
        }
        
        response = requests.post(
            f"{BASE_URL}/api/chat",
            json=jd_payload,
            headers={"Content-Type": "application/json"},
            timeout=30
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
            "message": "Please generate an optimized resume tailored for this Senior Full Stack Developer position",
            "attachments": []
        }
        
        response = requests.post(
            f"{BASE_URL}/api/chat",
            json=generate_payload,
            headers={"Content-Type": "application/json"},
            timeout=45
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
            "message": "Generate interview questions for a Senior Software Engineer position in the technology industry. Use a professional tone.",
            "attachments": []
        }
        
        response = requests.post(
            f"{BASE_URL}/api/chat",
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=30
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
            timeout=30
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
