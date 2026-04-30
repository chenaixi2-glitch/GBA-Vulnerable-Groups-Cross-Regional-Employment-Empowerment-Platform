// API接口模拟
const API = {
    // 模拟API请求延迟
    delay: (ms) => new Promise(resolve => setTimeout(resolve, ms)),
    
    // AI简历优化接口
    async optimizeResume(resumeData, options) {
        await this.delay(1500);
        
        // 模拟简历优化结果
        return {
            success: true,
            data: {
                originalResume: resumeData,
                optimizedResume: {
                    ...resumeData,
                    skills: [
                        ...resumeData.skills,
                        // 挖掘隐藏的软技能
                        "耐心",
                        "沟通能力",
                        "危机处理",
                        "团队协作",
                        "适应能力"
                    ],
                    experience: resumeData.experience.map(exp => ({
                        ...exp,
                        // 优化工作描述
                        description: exp.description + "。在这个过程中，我展示了出色的问题解决能力和团队协作精神。"
                    })),
                    // 优化后的简历评分
                    score: Math.floor(Math.random() * 20) + 80
                },
                suggestions: [
                    "突出了您的沟通能力和团队协作精神",
                    "挖掘了您在客服工作中体现的耐心和危机处理能力",
                    "优化了工作描述，使其更具说服力",
                    "调整了简历结构，使其更加清晰易读"
                ]
            }
        };
    },
    
    // AI人岗匹配接口
    async matchJobs(userProfile, filters) {
        await this.delay(1200);
        
        // 模拟岗位数据
        const mockJobs = [
            {
                id: 1,
                title: "跨境电商客服专员",
                company: "全球易购有限公司",
                location: "深圳",
                salary: "6K-8K",
                type: "全职",
                remote: true,
                accessibility: true,
                skills: ["沟通能力", "英语", "客户服务", "问题解决"],
                description: "负责处理国际客户咨询，提供产品信息和售后服务",
                matchScore: 92,
                matchReasons: [
                    "您的客服经验与岗位要求高度匹配",
                    "您的英语能力符合国际客服需求",
                    "您的耐心和沟通能力是该岗位的关键要求"
                ]
            },
            {
                id: 2,
                title: "数据标注师",
                company: "智能科技有限公司",
                location: "广州",
                salary: "5K-7K",
                type: "兼职",
                remote: true,
                accessibility: true,
                skills: ["细心", "专注力", "基本电脑操作"],
                description: "负责人工智能训练数据的标注和审核工作",
                matchScore: 88,
                matchReasons: [
                    "您的细致认真的工作态度适合数据标注工作",
                    "该岗位支持远程办公，时间灵活",
                    "工作环境无障碍，适合各类人士"
                ]
            },
            {
                id: 3,
                title: "内容审核员",
                company: "新媒体科技有限公司",
                location: "珠海",
                salary: "5.5K-7.5K",
                type: "全职",
                remote: false,
                accessibility: true,
                skills: ["责任心", "判断力", "基本电脑操作"],
                description: "负责平台内容的审核，确保内容合规",
                matchScore: 85,
                matchReasons: [
                    "您的责任心和判断力适合内容审核工作",
                    "公司提供无障碍工作环境",
                    "该岗位工作时间规律，适合需要稳定工作的人士"
                ]
            },
            {
                id: 4,
                title: "直播助理",
                company: "电商直播有限公司",
                location: "深圳",
                salary: "6K-8K",
                type: "兼职",
                remote: false,
                accessibility: false,
                skills: ["沟通能力", "应变能力", "基本电脑操作"],
                description: "协助主播进行直播，处理直播过程中的问题",
                matchScore: 80,
                matchReasons: [
                    "您的沟通能力和应变能力适合直播助理工作",
                    "该岗位提供培训，零基础可学",
                    "兼职工作，时间灵活"
                ]
            },
            {
                id: 5,
                title: "运营助理",
                company: "跨境电商有限公司",
                location: "香港",
                salary: "8K-10K",
                type: "全职",
                remote: false,
                accessibility: true,
                skills: ["数据分析", "沟通能力", "英语", "基本办公软件"],
                description: "协助运营经理进行日常运营工作，包括数据统计、内容策划等",
                matchScore: 78,
                matchReasons: [
                    "您的英语能力符合跨境电商需求",
                    "您的细心和责任心适合运营工作",
                    "公司提供完善的培训体系"
                ]
            }
        ];
        
        // 根据筛选条件过滤岗位
        let filteredJobs = mockJobs;
        
        if (filters.keyword) {
            const keyword = filters.keyword.toLowerCase();
            filteredJobs = filteredJobs.filter(job => 
                job.title.toLowerCase().includes(keyword) || 
                job.company.toLowerCase().includes(keyword) ||
                job.description.toLowerCase().includes(keyword)
            );
        }
        
        if (filters.location && filters.location !== "不限") {
            filteredJobs = filteredJobs.filter(job => job.location === filters.location);
        }
        
        if (filters.jobType && filters.jobType.length > 0) {
            filteredJobs = filteredJobs.filter(job => {
                if (filters.jobType.includes('全职') && job.type === '全职') return true;
                if (filters.jobType.includes('兼职') && job.type === '兼职') return true;
                if (filters.jobType.includes('远程') && job.remote) return true;
                if (filters.jobType.includes('灵活时间') && job.type === '兼职') return true;
                if (filters.jobType.includes('无障碍') && job.accessibility) return true;
                return false;
            });
        }
        
        // 按匹配度排序
        filteredJobs.sort((a, b) => b.matchScore - a.matchScore);
        
        return {
            success: true,
            data: {
                jobs: filteredJobs,
                total: filteredJobs.length
            }
        };
    },
    
    // AI面试辅导接口
    async interviewCoaching(resume, jobDescription, interviewStyle) {
        await this.delay(1000);
        
        // 模拟面试问题
        const mockQuestions = {
            professional: [
                "请详细描述您之前的客服工作经验，特别是处理投诉的案例。",
                "您如何理解跨境电商客服的职责？",
                "请解释您对我们公司产品的了解。",
                "您如何处理语言障碍导致的沟通问题？",
                "请分享您如何在高压环境下工作的经验。"
            ],
            cold: [
                "您的简历看起来很普通，为什么我们要录用您？",
                "您之前的工作经历中，有什么重大失误吗？",
                "您认为自己的弱点是什么？",
                "如果客户对您进行言语攻击，您会如何应对？",
                "您能接受加班和不规律的工作时间吗？"
            ],
            friendly: [
                "请简单介绍一下您自己。",
                "您为什么对我们公司感兴趣？",
                "在团队合作中，您通常扮演什么角色？",
                "您有什么爱好或特长？",
                "您如何平衡工作和生活？"
            ]
        };
        
        // 根据面试风格选择问题
        const questions = mockQuestions[interviewStyle] || mockQuestions.professional;
        
        return {
            success: true,
            data: {
                interviewStyle,
                questions,
                tips: [
                    "保持自信，回答问题时要清晰有条理",
                    "使用STAR法则（情境、任务、行动、结果）来结构化您的回答",
                    "展示您的软技能，特别是与岗位相关的能力",
                    "准备一些关于公司和行业的问题，展示您的兴趣和准备"
                ]
            }
        };
    },
    
    // AI政策问答接口
    async policyQA(question) {
        await this.delay(800);
        
        // 模拟政策问答数据
        const policyDatabase = {
            "跨境社保转移": {
                question: "跨境社保转移",
                answer: "根据《粤港澳大湾区发展规划纲要》，粤港澳三地正在推进社会保障体系的衔接。目前，香港和澳门居民在大湾区内地城市就业，可以参加内地社会保险。参保人返回港澳后，可以保留社保关系，也可以选择转移社保关系。具体操作流程如下：1. 在原参保地社保经办机构开具参保缴费凭证；2. 向新参保地社保经办机构提出转移申请；3. 新参保地社保经办机构受理申请后，与原参保地社保经办机构联系办理转移手续。",
                steps: [
                    "准备相关证件：身份证/港澳通行证、就业证明等",
                    "在原参保地社保经办机构开具参保缴费凭证",
                    "向新参保地社保经办机构提出转移申请",
                    "等待审核，通常需要15-30个工作日",
                    "审核通过后，社保关系正式转移"
                ]
            },
            "港澳人才15%个税补贴": {
                question: "港澳人才15%个税补贴",
                answer: "根据《关于粤港澳大湾区个人所得税优惠政策的通知》，在大湾区工作的境外高端人才和紧缺人才，其在珠三角九市缴纳的个人所得税已缴税额超过其按应纳税所得额的15%计算的税额部分，由珠三角九市人民政府给予财政补贴。补贴免征个人所得税。申请条件：1. 属于境外高端人才或紧缺人才；2. 在大湾区工作，依法缴纳个人所得税；3. 遵守法律法规，无不良记录。",
                formula: "补贴金额 = 已缴纳个税 - (应纳税所得额 × 15%)",
                example: "例如，某港澳人才在大湾区工作，年应纳税所得额为100万元，已缴纳个税30万元。补贴金额 = 30万 - (100万 × 15%) = 15万元。"
            },
            "残保金减免": {
                question: "残保金减免",
                answer: "根据《残疾人就业保障金征收使用管理办法》，用人单位安排残疾人就业的比例不得低于本单位在职职工总数的1.5%（不同地区比例可能不同）。达到或超过规定比例的用人单位，可以免征残保金；未达到规定比例的，应当缴纳残保金。此外，用人单位招用残疾人就业，还可以享受增值税优惠、企业所得税加计扣除等税收优惠政策。具体政策因地区而异，建议咨询当地残联或税务部门。",
                calculation: "残保金年缴纳额 = (上年用人单位在职职工人数 × 所在地规定的安排残疾人就业比例 - 上年用人单位实际安排的残疾人就业人数) × 上年用人单位在职职工年平均工资"
            },
            "企业补贴申请": {
                question: "企业补贴申请",
                answer: "大湾区各地政府为鼓励企业招聘弱势群体，提供了多种补贴政策。主要包括：1. 就业补贴：对招用残疾人、下岗失业人员等弱势群体的企业给予一定金额的就业补贴；2. 培训补贴：对企业开展的岗位技能培训给予补贴；3. 社保补贴：对企业为弱势群体缴纳的社会保险费用给予部分补贴；4. 场地补贴：对残疾人就业基地、创业孵化基地等给予场地补贴。申请流程通常包括：提交申请材料、审核、公示、发放补贴等环节。",
                requiredMaterials: [
                    "企业营业执照复印件",
                    "税务登记证复印件",
                    "组织机构代码证复印件",
                    "招聘人员花名册",
                    "劳动合同复印件",
                    "工资发放证明",
                    "社会保险缴费证明",
                    "残疾人证或其他相关证明"
                ]
            },
            "资质互认": {
                question: "资质互认",
                answer: "粤港澳大湾区正在推进专业资格互认工作，目前已在建筑、医疗、教育、会计等多个领域实现了部分资质互认。例如，香港建筑师、工程师可以通过简化程序在内地执业；香港医生可以在大湾区医院执业；香港教师可以在大湾区学校任教。具体互认范围和条件因行业而异，建议咨询相关行业协会或主管部门。",
                recognizedFields: [
                    "建筑领域：建筑师、工程师等",
                    "医疗领域：医生、护士等",
                    "教育领域：教师、教授等",
                    "会计领域：会计师、审计师等",
                    "法律领域：律师（有限度）"
                ]
            },
            "签证办理": {
                question: "签证办理",
                answer: "港澳居民前往内地工作，需要办理相应的签证或居留许可。香港居民可以申请港澳居民来往内地通行证（俗称'回乡证'）；澳门居民可以申请澳门特别行政区护照或澳门居民来往内地通行证。此外，如需在内地长期工作，还需要办理工作许可和居留许可。具体办理流程和所需材料可以咨询当地公安机关出入境管理部门。",
                requiredDocuments: [
                    "有效身份证件（港澳通行证/护照）",
                    "就业证明或邀请函",
                    "体检证明",
                    "无犯罪记录证明",
                    "近期照片",
                    "填写完整的申请表"
                ]
            }
        };
        
        // 简单的关键词匹配
        let matchedPolicy = null;
        for (const [key, value] of Object.entries(policyDatabase)) {
            if (question.includes(key)) {
                matchedPolicy = value;
                break;
            }
        }
        
        // 如果没有匹配到，返回通用回答
        if (!matchedPolicy) {
            return {
                success: true,
                data: {
                    question,
                    answer: "感谢您的咨询。您的问题涉及专业政策领域，建议咨询相关部门获取最准确的信息。您可以尝试询问以下常见问题：跨境社保转移、港澳人才15%个税补贴、残保金减免、企业补贴申请、资质互认、签证办理等。",
                    relatedTopics: Object.keys(policyDatabase)
                }
            };
        }
        
        return {
            success: true,
            data: matchedPolicy
        };
    },
    
    // AI学习路线接口
    async learningPath(targetJob, skillLevel) {
        await this.delay(1200);
        
        // 模拟学习路线数据
        const learningPaths = {
            "电商客服": {
                beginner: {
                    modules: [
                        {
                            title: "电商基础知识",
                            courses: [
                                "电商平台介绍（淘宝、京东、亚马逊等）",
                                "电商客服的角色与职责",
                                "电商术语与常用词汇"
                            ],
                            duration: "1周",
                            resources: ["视频课程", "在线练习", "知识库"]
                        },
                        {
                            title: "沟通技巧训练",
                            courses: [
                                "有效沟通的基本原则",
                                "积极倾听技巧",
                                "表达清晰与同理心"
                            ],
                            duration: "1周",
                            resources: ["互动练习", "角色扮演", "案例分析"]
                        },
                        {
                            title: "客户服务技能",
                            courses: [
                                "客户需求分析",
                                "问题解决技巧",
                                "投诉处理流程",
                                "售后服务规范"
                            ],
                            duration: "2周",
                            resources: ["模拟练习", "情景对话", "实战演练"]
                        },
                        {
                            title: "电商平台操作",
                            courses: [
                                "订单处理流程",
                                "退换货操作",
                                "物流查询与跟踪",
                                "系统操作规范"
                            ],
                            duration: "1周",
                            resources: ["操作演示", "实操练习", "考核测试"]
                        }
                    ],
                    certificate: "电商客服基础资格证书",
                    jobOpportunities: ["初级电商客服", "在线客服专员", "售后客服"]
                },
                intermediate: {
                    modules: [
                        {
                            title: "高级沟通技巧",
                            courses: [
                                "高难度客户应对策略",
                                "情绪管理与压力释放",
                                "跨文化沟通技巧"
                            ],
                            duration: "1周",
                            resources: ["案例分析", "角色扮演", "专家指导"]
                        },
                        {
                            title: "产品知识深化",
                            courses: [
                                "产品功能与特点详解",
                                "竞品分析与对比",
                                "行业趋势与动态"
                            ],
                            duration: "1周",
                            resources: ["产品培训", "市场调研", "行业报告"]
                        },
                        {
                            title: "销售技巧提升",
                            courses: [
                                "主动营销意识培养",
                                " upsell与cross-sell技巧",
                                "客户需求挖掘"
                            ],
                            duration: "2周",
                            resources: ["销售培训", "实战演练", "业绩跟踪"]
                        },
                        {
                            title: "数据分析能力",
                            courses: [
                                "客服数据指标解读",
                                "客户满意度分析",
                                "问题类型统计与改进"
                            ],
                            duration: "1周",
                            resources: ["数据分析工具", "报表制作", "改进方案"]
                        }
                    ],
                    certificate: "高级电商客服资格证书",
                    jobOpportunities: ["高级电商客服", "客服组长", "客户关系管理专员"]
                },
                advanced: {
                    modules: [
                        {
                            title: "团队管理能力",
                            courses: [
                                "团队建设与激励",
                                "绩效评估与反馈",
                                "培训与指导技巧"
                            ],
                            duration: "2周",
                            resources: ["管理培训", "案例分析", "实践项目"]
                        },
                        {
                            title: "流程优化与创新",
                            courses: [
                                "客服流程分析与改进",
                                "创新思维培养",
                                "客户体验设计"
                            ],
                            duration: "2周",
                            resources: ["工作坊", "创新项目", "成果展示"]
                        },
                        {
                            title: "战略思维培养",
                            courses: [
                                "客户服务战略规划",
                                "品牌建设与维护",
                                "危机管理与应对"
                            ],
                            duration: "2周",
                            resources: ["战略研讨", "案例分析", "专家讲座"]
                        }
                    ],
                    certificate: "电商客服管理资格证书",
                    jobOpportunities: ["客服经理", "客户服务总监", "客户体验负责人"]
                }
            },
            "数据标注师": {
                beginner: {
                    modules: [
                        {
                            title: "数据标注基础",
                            courses: [
                                "数据标注概念与意义",
                                "常见数据类型介绍",
                                "标注工具基本操作"
                            ],
                            duration: "1周",
                            resources: ["视频教程", "在线练习", "操作指南"]
                        },
                        {
                            title: "图像标注技能",
                            courses: [
                                "图像分类标注方法",
                                "物体检测标注技巧",
                                "图像分割标注规范"
                            ],
                            duration: "2周",
                            resources: ["实操练习", "质量检查", "案例分析"]
                        },
                        {
                            title: "文本标注技能",
                            courses: [
                                "情感分析标注",
                                "实体识别标注",
                                "意图识别标注"
                            ],
                            duration: "2周",
                            resources: ["实操练习", "质量检查", "案例分析"]
                        },
                        {
                            title: "质量控制与标准",
                            courses: [
                                "标注质量评估标准",
                                "常见错误与避免方法",
                                "自我检查技巧"
                            ],
                            duration: "1周",
                            resources: ["质量培训", "错误案例", "最佳实践"]
                        }
                    ],
                    certificate: "数据标注基础资格证书",
                    jobOpportunities: ["初级数据标注师", "图像标注员", "文本标注员"]
                },
                intermediate: {
                    modules: [
                        {
                            title: "高级标注技术",
                            courses: [
                                "3D点云标注",
                                "视频标注技巧",
                                "多模态数据标注"
                            ],
                            duration: "2周",
                            resources: ["专项培训", "实操项目", "技术指导"]
                        },
                        {
                            title: "领域知识深化",
                            courses: [
                                "自动驾驶数据标注规范",
                                "医疗影像标注要求",
                                "金融数据标注特点"
                            ],
                            duration: "2周",
                            resources: ["领域专家讲座", "行业标准", "案例分析"]
                        },
                        {
                            title: "标注效率提升",
                            courses: [
                                "快捷键与操作技巧",
                                "批量处理方法",
                                "自动化工具应用"
                            ],
                            duration: "1周",
                            resources: ["效率培训", "工具教程", "实践演练"]
                        },
                        {
                            title: "质量审核能力",
                            courses: [
                                "审核标准与流程",
                                "问题识别与反馈",
                                "质量改进建议"
                            ],
                            duration: "1周",
                            resources: ["审核培训", "案例练习", "反馈机制"]
                        }
                    ],
                    certificate: "高级数据标注资格证书",
                    jobOpportunities: ["高级数据标注师", "标注审核员", "标注项目协调员"]
                },
                advanced: {
                    modules: [
                        {
                            title: "项目管理能力",
                            courses: [
                                "数据标注项目规划",
                                "资源分配与进度控制",
                                "质量保证体系建立"
                            ],
                            duration: "2周",
                            resources: ["项目管理培训", "实战项目", "成果评估"]
                        },
                        {
                            title: "标注工具开发",
                            courses: [
                                "标注工具需求分析",
                                "自定义标注模板设计",
                                "标注流程自动化"
                            ],
                            duration: "3周",
                            resources: ["工具开发培训", "实践项目", "技术支持"]
                        },
                        {
                            title: "AI训练数据策略",
                            courses: [
                                "训练数据需求分析",
                                "数据质量评估体系",
                                "数据增强技术应用"
                            ],
                            duration: "2周",
                            resources: ["AI知识培训", "案例分析", "专家指导"]
                        }
                    ],
                    certificate: "数据标注管理资格证书",
                    jobOpportunities: ["数据标注项目经理", "数据质量总监", "AI训练数据专家"]
                }
            },
            "直播助理": {
                beginner: {
                    modules: [
                        {
                            title: "直播基础知识",
                            courses: [
                                "直播平台介绍与特点",
                                "直播流程与角色分工",
                                "直播设备使用基础"
                            ],
                            duration: "1周",
                            resources: ["视频教程", "平台指南", "设备操作手册"]
                        },
                        {
                            title: "直播内容准备",
                            courses: [
                                "产品信息整理",
                                "直播脚本撰写",
                                "互动环节设计"
                            ],
                            duration: "1周",
                            resources: ["案例分析", "写作指导", "创意激发"]
                        },
                        {
                            title: "直播现场协助",
                            courses: [
                                "实时弹幕管理",
                                "产品链接上架",
                                "突发情况处理"
                            ],
                            duration: "2周",
                            resources: ["模拟演练", "实战指导", "应急方案"]
                        },
                        {
                            title: "直播数据分析",
                            courses: [
                                "关键数据指标解读",
                                "观众行为分析",
                                "销售转化分析"
                            ],
                            duration: "1周",
                            resources: ["数据分析工具", "报表制作", "改进建议"]
                        }
                    ],
                    certificate: "直播助理基础资格证书",
                    jobOpportunities: ["初级直播助理", "电商直播助理", "直播运营助理"]
                },
                intermediate: {
                    modules: [
                        {
                            title: "直播策划能力",
                            courses: [
                                "直播主题策划",
                                "内容节奏把控",
                                "营销活动设计"
                            ],
                            duration: "2周",
                            resources: ["策划培训", "案例分析", "实战项目"]
                        },
                        {
                            title: "观众互动技巧",
                            courses: [
                                "粉丝心理分析",
                                "有效互动方式",
                                "社群运营策略"
                            ],
                            duration: "1周",
                            resources: ["心理学课程", "互动案例", "社群管理工具"]
                        },
                        {
                            title: "直播技术提升",
                            courses: [
                                "灯光与音效优化",
                                "多机位切换技巧",
                                "直播推流设置"
                            ],
                            duration: "1周",
                            resources: ["技术培训", "设备实操", "效果调试"]
                        },
                        {
                            title: "数据分析与优化",
                            courses: [
                                "深度数据分析方法",
                                "竞品直播分析",
                                "优化方案制定"
                            ],
                            duration: "1周",
                            resources: ["数据分析工具", "竞品调研", "优化实践"]
                        }
                    ],
                    certificate: "高级直播助理资格证书",
                    jobOpportunities: ["高级直播助理", "直播运营专员", "直播策划师"]
                },
                advanced: {
                    modules: [
                        {
                            title: "直播团队管理",
                            courses: [
                                "团队组建与分工",
                                "绩效评估与激励",
                                "协作流程优化"
                            ],
                            duration: "2周",
                            resources: ["管理培训", "团队建设", "流程设计"]
                        },
                        {
                            title: "直播内容创新",
                            courses: [
                                "创意策略与方法",
                                "跨界合作模式",
                                "IP打造与运营"
                            ],
                            duration: "2周",
                            resources: ["创意工作坊", "案例研究", "创新项目"]
                        },
                        {
                            title: "直播商业化运营",
                            courses: [
                                "品牌合作谈判",
                                "赞助方案设计",
                                "ROI评估与优化"
                            ],
                            duration: "2周",
                            resources: ["商业培训", "谈判技巧", "案例分析"]
                        }
                    ],
                    certificate: "直播运营管理资格证书",
                    jobOpportunities: ["直播运营经理", "内容总监", "直播业务负责人"]
                }
            }
        };
        
        // 根据目标岗位和技能水平选择学习路线
        const path = learningPaths[targetJob];
        if (!path) {
            return {
                success: false,
                message: "暂未找到相关学习路线，请选择其他岗位"
            };
        }
        
        // 根据技能水平选择难度
        let levelPath;
        if (skillLevel <= 2) {
            levelPath = path.beginner;
        } else if (skillLevel <= 4) {
            levelPath = path.intermediate;
        } else {
            levelPath = path.advanced;
        }
        
        return {
            success: true,
            data: {
                targetJob,
                skillLevel,
                learningPath: levelPath
            }
        };
    },
    
    // AI技能评估接口
    async skillAssessment(userProfile) {
        await this.delay(1000);
        
        // 模拟技能评估结果
        return {
            success: true,
            data: {
                overallScore: Math.floor(Math.random() * 20) + 70, // 70-90之间的随机数
                skillScores: {
                    "沟通能力": Math.floor(Math.random() * 30) + 70,
                    "团队协作": Math.floor(Math.random() * 30) + 70,
                    "问题解决": Math.floor(Math.random() * 30) + 70,
                    "学习能力": Math.floor(Math.random() * 30) + 70,
                    "适应能力": Math.floor(Math.random() * 30) + 70,
                    "专业技能": Math.floor(Math.random() * 30) + 70,
                    "创新思维": Math.floor(Math.random() * 30) + 70,
                    "时间管理": Math.floor(Math.random() * 30) + 70
                },
                strengths: [
                    "您的沟通能力和团队协作能力很强，适合需要与人打交道的工作",
                    "您的学习能力突出，能够快速掌握新技能和知识",
                    "您的适应能力良好，能够在变化的环境中保持高效"
                ],
                improvementAreas: [
                    "可以进一步提升专业技能，特别是与目标岗位相关的特定技能",
                    "创新思维可以通过更多的实践和训练来加强",
                    "时间管理能力有提升空间，可以学习一些时间管理技巧"
                ],
                recommendedJobs: [
                    {
                        title: "电商客服",
                        matchScore: Math.floor(Math.random() * 15) + 80,
                        reason: "您的沟通能力和耐心非常适合客服工作"
                    },
                    {
                        title: "数据标注师",
                        matchScore: Math.floor(Math.random() * 15) + 75,
                        reason: "您的细心和专注力适合数据标注工作"
                    },
                    {
                        title: "内容审核员",
                        matchScore: Math.floor(Math.random() * 15) + 70,
                        reason: "您的责任心和判断力适合内容审核工作"
                    }
                ]
            }
        };
    },
    
    // AI语音助手接口
    async voiceAssistant(query, userId) {
        await this.delay(600);
        
        // 模拟语音助手回答
        const responses = {
            "如何优化简历": {
                text: "要优化简历，首先需要突出您的核心技能和工作成果。使用具体的数据和案例来展示您的成就，而不仅仅是列出职责。针对不同的岗位，可以调整简历的重点，确保与岗位要求匹配。此外，保持简历简洁明了，避免过长或过于复杂的描述。您可以使用我们平台的AI简历优化功能，上传您的简历获取个性化的优化建议。",
                actions: [
                    {
                        type: "button",
                        text: "立即优化简历",
                        action: "open_modal",
                        modal: "resume-optimize"
                    }
                ]
            },
            "查找客服岗位": {
                text: "根据您的技能和偏好，我为您找到了几个匹配度较高的客服岗位。这些岗位包括跨境电商客服专员、在线客服专员等，部分岗位支持远程办公和灵活工作时间。您可以查看详细信息，了解岗位要求和薪资待遇。",
                actions: [
                    {
                        type: "button",
                        text: "查看匹配岗位",
                        action: "open_modal",
                        modal: "job-match"
                    }
                ]
            },
            "跨境社保政策": {
                text: "跨境社保政策主要涉及粤港澳三地社会保障体系的衔接。目前，香港和澳门居民在大湾区内地城市就业，可以参加内地社会保险。参保人返回港澳后，可以保留社保关系，也可以选择转移社保关系。具体操作需要在原参保地开具参保缴费凭证，然后向新参保地提出转移申请。",
                actions: [
                    {
                        type: "button",
                        text: "了解详情",
                        action: "open_modal",
                        modal: "policy-qa",
                        params: { question: "跨境社保转移" }
                    }
                ]
            },
            "开始模拟面试": {
                text: "好的，我可以帮您安排一场模拟面试。我们提供三种面试风格：专业型、冷漠型和亲和型。您可以根据自己的需要选择适合的面试风格，系统会根据您的简历和目标岗位生成相关问题。面试结束后，您将收到详细的评分和改进建议。",
                actions: [
                    {
                        type: "button",
                        text: "开始面试",
                        action: "open_modal",
                        modal: "interview-coach"
                    }
                ]
            }
        };
        
        // 查找匹配的回答
        for (const [key, value] of Object.entries(responses)) {
            if (query.includes(key)) {
                return {
                    success: true,
                    data: value
                };
            }
        }
        
        // 默认回答
        return {
            success: true,
            data: {
                text: "您好，我是您的AI语音助手Olivia。我可以帮您解答跨境就业相关问题，如简历优化、岗位匹配、政策咨询等。请问有什么可以帮到您？",
                actions: [
                    {
                        type: "button",
                        text: "优化简历",
                        action: "open_modal",
                        modal: "resume-optimize"
                    },
                    {
                        type: "button",
                        text: "查找岗位",
                        action: "open_modal",
                        modal: "job-match"
                    },
                    {
                        type: "button",
                        text: "政策咨询",
                        action: "open_modal",
                        modal: "policy-qa"
                    }
                ]
            }
        };
    }
};

// 导出API对象
if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
}