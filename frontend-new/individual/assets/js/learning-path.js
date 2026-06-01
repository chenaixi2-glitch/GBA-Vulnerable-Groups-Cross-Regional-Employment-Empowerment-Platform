/**
 * GBA Platform - Learning Path Generator
 */

let learningPathData = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    initializeLearningPath();
});

function initializeLearningPath() {
    // Load session
    const sessionId = apiClient.loadSessionId();
    if (sessionId) {
        Utils.updateSessionDisplay(sessionId);
    } else {
        apiClient.generateSessionId();
        Utils.updateSessionDisplay(apiClient.sessionId);
    }
}

/**
 * Generate personalized learning path
 */
async function generateLearningPath() {
    const targetJob = document.getElementById('target-job').value.trim();
    const currentRole = document.getElementById('current-role').value.trim();
    const industry = document.getElementById('industry-focus').value;
    const timeline = document.getElementById('timeline').value;
    const currentSkillsText = document.getElementById('current-skills').value.trim();

    if (!targetJob) {
        Utils.showToast('Please enter your target job title');
        return;
    }

    try {
        // Show loading state
        document.getElementById('assessment-section').classList.add('hidden');
        document.getElementById('loading-state').classList.remove('hidden');

        // Parse current skills
        const currentSkills = currentSkillsText
            ? currentSkillsText.split(',').map(s => s.trim()).filter(s => s)
            : [];

        // Call backend to generate learning path
        const response = await apiClient.generateLearningPath(targetJob, currentSkills, timeline);

        // Process response (adjust based on actual API structure)
        learningPathData = processLearningPathResponse(response, targetJob, currentSkills, timeline);

        // Hide loading, show results
        document.getElementById('loading-state').classList.add('hidden');
        document.getElementById('learning-path-results').classList.remove('hidden');
        document.getElementById('empty-state').classList.add('hidden');

        // Display results
        displayOverview(learningPathData);
        displaySkillGaps(learningPathData.skillGaps);
        displayTimeline(learningPathData.timeline);
        displayResources(learningPathData.resources);

        Utils.showToast('Learning path generated successfully!');

        // Scroll to results
        document.getElementById('learning-path-results').scrollIntoView({ behavior: 'smooth' });

        console.log('Learning path data:', learningPathData);
    } catch (error) {
        document.getElementById('loading-state').classList.add('hidden');
        document.getElementById('assessment-section').classList.remove('hidden');
        
        Utils.showToast('Failed to generate learning path: ' + error.message);
        console.error('Learning path error:', error);
    }
}

/**
 * Process learning path response from API
 */
function processLearningPathResponse(response, targetJob, currentSkills, timeline) {
    // This should be adjusted based on the actual API response structure
    // For now, creating a mock structure that matches the UI requirements
    
    const skillGaps = response.gaps || generateMockSkillGaps(targetJob, currentSkills);
    const timeline = response.timeline || generateMockTimeline(skillGaps, timeline);
    const resources = response.resources || generateMockResources(skillGaps);

    return {
        targetJob,
        currentSkills,
        timeline,
        skillGaps,
        resources,
        totalSkills: skillGaps.length,
        estimatedWeeks: calculateEstimatedWeeks(timeline),
        confidenceScore: calculateConfidenceScore(skillGaps),
    };
}

/**
 * Generate mock skill gaps (replace with actual API data)
 */
function generateMockSkillGaps(targetJob, currentSkills) {
    // Common skills for different job types
    const skillDatabase = {
        'software engineer': [
            { skill: 'JavaScript', level_required: 'Advanced', level_current: 'Intermediate', priority: 'High' },
            { skill: 'React', level_required: 'Advanced', level_current: 'Beginner', priority: 'High' },
            { skill: 'Node.js', level_required: 'Intermediate', level_current: 'Beginner', priority: 'Medium' },
            { skill: 'TypeScript', level_required: 'Intermediate', level_current: 'None', priority: 'Medium' },
            { skill: 'Docker', level_required: 'Basic', level_current: 'None', priority: 'Low' },
        ],
        'data scientist': [
            { skill: 'Python', level_required: 'Advanced', level_current: 'Intermediate', priority: 'High' },
            { skill: 'Machine Learning', level_required: 'Advanced', level_current: 'Beginner', priority: 'High' },
            { skill: 'SQL', level_required: 'Advanced', level_current: 'Intermediate', priority: 'Medium' },
            { skill: 'TensorFlow', level_required: 'Intermediate', level_current: 'None', priority: 'Medium' },
            { skill: 'Data Visualization', level_required: 'Intermediate', level_current: 'Beginner', priority: 'Low' },
        ],
    };

    const jobKey = targetJob.toLowerCase();
    return skillDatabase[jobKey] || [
        { skill: 'Technical Skill 1', level_required: 'Advanced', level_current: 'Beginner', priority: 'High' },
        { skill: 'Technical Skill 2', level_required: 'Intermediate', level_current: 'None', priority: 'Medium' },
        { skill: 'Soft Skill', level_required: 'Advanced', level_current: 'Intermediate', priority: 'Medium' },
    ];
}

/**
 * Generate mock timeline (replace with actual API data)
 */
function generateMockTimeline(skillGaps, timelineValue) {
    const weeksMap = {
        '3months': 12,
        '6months': 24,
        '12months': 48,
        'custom': 24,
    };

    const totalWeeks = weeksMap[timelineValue] || 24;
    const phases = Math.ceil(skillGaps.length / 3);
    const weeksPerPhase = Math.floor(totalWeeks / phases);

    const timeline = [];
    let currentWeek = 1;

    for (let i = 0; i < phases; i++) {
        const phaseSkills = skillGaps.slice(i * 3, (i + 1) * 3);
        timeline.push({
            phase: i + 1,
            title: `Phase ${i + 1}: Foundation & Core Skills`,
            weeks: `${currentWeek}-${currentWeek + weeksPerPhase - 1}`,
            skills: phaseSkills.map(s => s.skill),
            description: `Focus on mastering ${phaseSkills.length} key skills`,
        });
        currentWeek += weeksPerPhase;
    }

    return timeline;
}

/**
 * Generate mock resources (replace with actual API data)
 */
function generateMockResources(skillGaps) {
    const resourceTypes = ['course', 'article', 'video', 'project'];
    const platforms = ['Coursera', 'Udemy', 'edX', 'YouTube', 'Medium', 'GitHub'];

    return skillGaps.map((gap, index) => ({
        id: index + 1,
        skill: gap.skill,
        type: resourceTypes[index % resourceTypes.length],
        title: `${gap.skill} Mastery Course`,
        platform: platforms[index % platforms.length],
        duration: `${Math.floor(Math.random() * 20 + 5)} hours`,
        url: '#',
        rating: (Math.random() * 2 + 3).toFixed(1),
    }));
}

/**
 * Calculate estimated weeks
 */
function calculateEstimatedWeeks(timeline) {
    return timeline.length * 6; // Average 6 weeks per phase
}

/**
 * Calculate confidence score
 */
function calculateConfidenceScore(skillGaps) {
    const highPriorityCount = skillGaps.filter(g => g.priority === 'High').length;
    const baseScore = 85;
    const penalty = highPriorityCount * 5;
    return Math.max(baseScore - penalty, 50);
}

/**
 * Display overview statistics
 */
function displayOverview(data) {
    document.getElementById('total-skills').textContent = data.totalSkills;
    document.getElementById('estimated-weeks').textContent = data.estimatedWeeks;
    document.getElementById('confidence-score').textContent = `${data.confidenceScore}%`;
}

/**
 * Display skill gaps
 */
function displaySkillGaps(skillGaps) {
    const container = document.getElementById('skill-gaps-container');

    const html = skillGaps.map(gap => `
        <div class="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
            <div class="flex items-center justify-between mb-3">
                <h4 class="font-bold text-gray-900">${gap.skill}</h4>
                <span class="px-3 py-1 rounded-full text-xs font-medium ${getPriorityClass(gap.priority)}">
                    ${gap.priority} Priority
                </span>
            </div>
            
            <div class="grid grid-cols-2 gap-4 mb-3">
                <div>
                    <div class="text-xs text-gray-500 mb-1">Current Level</div>
                    <span class="skill-badge skill-current">
                        <i class="fas fa-circle text-xs"></i>
                        ${gap.level_current || 'None'}
                    </span>
                </div>
                <div>
                    <div class="text-xs text-gray-500 mb-1">Required Level</div>
                    <span class="skill-badge skill-target">
                        <i class="fas fa-bullseye text-xs"></i>
                        ${gap.level_required}
                    </span>
                </div>
            </div>
            
            <div class="bg-gray-50 rounded-lg p-3">
                <div class="text-xs text-gray-600 mb-2">Learning Resources Available</div>
                <div class="flex gap-2">
                    <span class="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">Courses</span>
                    <span class="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">Articles</span>
                    <span class="text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded">Projects</span>
                </div>
            </div>
        </div>
    `).join('');

    container.innerHTML = html;
}

/**
 * Get CSS class for priority level
 */
function getPriorityClass(priority) {
    switch (priority?.toLowerCase()) {
        case 'high':
            return 'bg-red-100 text-red-800';
        case 'medium':
            return 'bg-yellow-100 text-yellow-800';
        case 'low':
            return 'bg-green-100 text-green-800';
        default:
            return 'bg-gray-100 text-gray-800';
    }
}

/**
 * Display learning timeline
 */
function displayTimeline(timeline) {
    const container = document.getElementById('timeline-container');

    const html = timeline.map(phase => `
        <div class="timeline-item">
            <div class="timeline-dot"></div>
            <div class="bg-white border border-gray-200 rounded-lg p-4 ml-4">
                <div class="flex items-center justify-between mb-2">
                    <h4 class="font-bold text-gray-900">${phase.title}</h4>
                    <span class="text-sm text-gray-500">Weeks ${phase.weeks}</span>
                </div>
                <p class="text-sm text-gray-600 mb-3">${phase.description}</p>
                <div class="flex flex-wrap gap-2">
                    ${phase.skills.map(skill => `
                        <span class="text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded">
                            ${skill}
                        </span>
                    `).join('')}
                </div>
            </div>
        </div>
    `).join('');

    container.innerHTML = html;
}

/**
 * Display learning resources
 */
function displayResources(resources) {
    const container = document.getElementById('resources-container');

    const html = resources.map(resource => `
        <div class="resource-card resource-${resource.type}">
            <div class="flex items-start justify-between mb-2">
                <div>
                    <div class="flex items-center gap-2 mb-1">
                        <i class="fas ${getResourceIcon(resource.type)} text-lg"></i>
                        <span class="text-xs font-medium uppercase">${resource.type}</span>
                    </div>
                    <h4 class="font-bold text-gray-900 text-sm">${resource.title}</h4>
                    <p class="text-xs text-gray-500 mt-1">${resource.platform} · ${resource.duration}</p>
                </div>
                <div class="flex items-center gap-1 text-yellow-500">
                    <i class="fas fa-star text-xs"></i>
                    <span class="text-xs font-medium">${resource.rating}</span>
                </div>
            </div>
            <a href="${resource.url}" target="_blank" class="inline-flex items-center text-sm text-blue-600 hover:text-blue-700 mt-2">
                View Resource
                <i class="fas fa-external-link-alt ml-1 text-xs"></i>
            </a>
        </div>
    `).join('');

    container.innerHTML = html;
}

/**
 * Get icon class for resource type
 */
function getResourceIcon(type) {
    const icons = {
        'course': 'fa-graduation-cap',
        'article': 'fa-newspaper',
        'video': 'fa-play-circle',
        'project': 'fa-code',
    };
    return icons[type] || 'fa-book';
}

/**
 * Download complete learning plan
 */
function downloadLearningPlan() {
    if (!learningPathData) {
        Utils.showToast('No learning plan to download');
        return;
    }

    // Build plan text
    let plan = `PERSONALIZED LEARNING PLAN\n`;
    plan += `==========================\n\n`;
    plan += `Target Position: ${learningPathData.targetJob}\n`;
    plan += `Timeline: ${learningPathData.estimatedWeeks} weeks\n`;
    plan += `Skills to Master: ${learningPathData.totalSkills}\n`;
    plan += `Success Probability: ${learningPathData.confidenceScore}%\n\n`;
    
    plan += `SKILL GAPS:\n`;
    plan += `===========\n\n`;
    
    learningPathData.skillGaps.forEach((gap, index) => {
        plan += `${index + 1}. ${gap.skill}\n`;
        plan += `   Current: ${gap.level_current || 'None'} → Required: ${gap.level_required}\n`;
        plan += `   Priority: ${gap.priority}\n\n`;
    });

    plan += `\nLEARNING TIMELINE:\n`;
    plan += `=================\n\n`;
    
    learningPathData.timeline.forEach(phase => {
        plan += `${phase.title} (Weeks ${phase.weeks})\n`;
        plan += `Skills: ${phase.skills.join(', ')}\n\n`;
    });

    plan += `\nRECOMMENDED RESOURCES:\n`;
    plan += `=====================\n\n`;
    
    learningPathData.resources.forEach(resource => {
        plan += `- ${resource.title} (${resource.type})\n`;
        plan += `  Platform: ${resource.platform} | Duration: ${resource.duration}\n\n`;
    });

    // Download as text file
    const blob = new Blob([plan], { type: 'text/plain' });
    Utils.downloadFile(blob, `learning-plan-${Date.now()}.txt`);
    Utils.showToast('Learning plan downloaded');
}
