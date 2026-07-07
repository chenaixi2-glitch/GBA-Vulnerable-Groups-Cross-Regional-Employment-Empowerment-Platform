/**
 * Merge site-guide strings into locale JSON files.
 * Run: node backend/scripts/merge_site_guide_i18n.js
 */
const fs = require('fs');
const path = require('path');

const localesDir = path.join(__dirname, '..', '..', 'assets', 'i18n', 'locales');

const SITE_GUIDE = {
  'zh-CN': {
    fabLabel: '使用指引',
    welcomeTitle: '欢迎使用大湾区就业赋能平台',
    welcomeBody:
      '接下来将用几步介绍网站主要功能。可随时跳过，之后也可通过左下角按钮重温指引。',
    stepOf: '第 {current} / {total} 步',
    skip: '跳过指引',
    back: '上一步',
    next: '下一步',
    finish: '完成',
    replay: '重温指引',
    close: '关闭',
    steps: {
      home: [
        {
          title: '欢迎使用大湾区就业赋能平台',
          body: '本平台连接大湾区求职者与包容型企业，提供 AI 简历/面试、岗位匹配与法律支持等服务。',
        },
        {
          title: '选择入口',
          body: '个人用户进入「个人端」，企业用户进入「企业端」。两端共享同一套平台能力。',
        },
        {
          title: '平台能力',
          body: '了解智能简历、面试准备、学习路径、政策工具与包容招聘等功能，助力跨境就业。',
        },
        {
          title: '运作方式',
          body: '从注册建档、智能匹配到投递、面试与入职跟进，一站式完成就业闭环。',
        },
        {
          title: '常见问题',
          body: '查阅访问权限、捐款解锁、数据安全与无障碍等说明，点击问题展开详情。',
        },
        {
          title: '语言与无障碍',
          body: '可切换英文、中文与葡语。',
        },
      ],
      individual: [
        {
          title: '个人端使用指引',
          body: '仪表盘集中了 AI 职业工具、岗位匹配、投递记录与捐款/法律服务入口。',
        },
        {
          title: '个人仪表盘',
          body: '在此查看全部工具入口与访问状态横幅，建议先完善资料再开始使用。',
        },
        {
          title: '智能简历',
          body: '上传简历与目标岗位描述，AI 分析差距并生成定制版简历。',
        },
        {
          title: '面试准备',
          body: '针对目标岗位练习 AI 生成的面试题，获得反馈后再参加真实面试。',
        },
        {
          title: '岗位匹配',
          body: '按人群类型与简历评分浏览推荐岗位，平台内可直接投递。',
        },
        {
          title: '捐款与法律服务',
          body: '弱势群体免费使用；其他用户可向法律服务捐款箱捐款（金额不限）以解锁功能。',
        },
      ],
      corporate: [
        {
          title: '企业端使用指引',
          body: '在一个门户中管理包容招聘、发布带目标条件的岗位，并查看评分排序的申请人。',
        },
        {
          title: '招聘仪表盘',
          body: '查看多样性指标、招聘漏斗数据与快捷操作。',
        },
        {
          title: 'HR 与合规工具',
          body: '使用盲筛、合规测算、DEI 分析与远程包容工作就绪检查。',
        },
        {
          title: '岗位管理',
          body: '查看已发布岗位、编辑要求并监控申请量。',
        },
        {
          title: '发布岗位',
          body: '创建带目标人群条件的包容型岗位，以便系统准确匹配评分。',
        },
        {
          title: '语言',
          body: '在此切换界面语言。',
        },
      ],
    },
  },
  'zh-TW': {
    fabLabel: '使用指引',
    welcomeTitle: '歡迎使用大灣區就業賦能平台',
    welcomeBody:
      '接下來將用幾步介紹網站主要功能。可隨時跳過，之後也可透過左下角按鈕重溫指引。',
    stepOf: '第 {current} / {total} 步',
    skip: '跳過指引',
    back: '上一步',
    next: '下一步',
    finish: '完成',
    replay: '重溫指引',
    close: '關閉',
    steps: {
      home: [
        {
          title: '歡迎使用大灣區就業賦能平台',
          body: '本平台連接大灣區求職者與包容型企業，提供 AI 履歷/面試、職位匹配與法律支援等服務。',
        },
        {
          title: '選擇入口',
          body: '個人用戶進入「個人端」，企業用戶進入「企業端」。兩端共享同一套平台能力。',
        },
        {
          title: '平台能力',
          body: '了解智能履歷、面試準備、學習路徑、政策工具與包容招聘等功能，助力跨境就業。',
        },
        {
          title: '運作方式',
          body: '從註冊建檔、智能匹配到投遞、面試與入職跟進，一站式完成就業閉環。',
        },
        {
          title: '常見問題',
          body: '查閱訪問權限、捐款解鎖、資料安全與無障礙等說明，點擊問題展開詳情。',
        },
        {
          title: '語言與無障礙',
          body: '可切換英文、中文與葡語。',
        },
      ],
      individual: [
        {
          title: '個人端使用指引',
          body: '儀表板集中了 AI 職業工具、職位匹配、投遞記錄與捐款/法律服務入口。',
        },
        {
          title: '個人儀表板',
          body: '在此查看全部工具入口與訪問狀態橫幅，建議先完善資料再開始使用。',
        },
        {
          title: '智能履歷',
          body: '上傳履歷與目標職位描述，AI 分析差距並生成定制版履歷。',
        },
        {
          title: '面試準備',
          body: '針對目標職位練習 AI 生成的面試題，獲得回饋後再參加真實面試。',
        },
        {
          title: '職位匹配',
          body: '按人群類型與履歷評分瀏覽推薦職位，平台內可直接投遞。',
        },
        {
          title: '捐款與法律服務',
          body: '弱勢群體免費使用；其他用戶可向法律服務捐款箱捐款（金額不限）以解鎖功能。',
        },
      ],
      corporate: [
        {
          title: '企業端使用指引',
          body: '在一個門戶中管理包容招聘、發布帶目標條件的職位，並查看評分排序的申請人。',
        },
        {
          title: '招聘儀表板',
          body: '查看多樣性指標、招聘漏斗數據與快捷操作。',
        },
        {
          title: 'HR 與合規工具',
          body: '使用盲篩、合規測算、DEI 分析與遠端包容工作就緒檢查。',
        },
        {
          title: '職位管理',
          body: '查看已發布職位、編輯要求並監控申請量。',
        },
        {
          title: '發布職位',
          body: '創建帶目標人群條件的包容型職位，以便系統準確匹配評分。',
        },
        {
          title: '語言',
          body: '在此切換介面語言。',
        },
      ],
    },
  },
  pt: {
    fabLabel: 'Guia do site',
    welcomeTitle: 'Bem-vindo à Plataforma GBA',
    welcomeBody:
      'Este tour rápido mostra como navegar no site. Pode saltar a qualquer momento e rever depois no botão de guia.',
    stepOf: 'Passo {current} de {total}',
    skip: 'Saltar tour',
    back: 'Anterior',
    next: 'Seguinte',
    finish: 'Concluir',
    replay: 'Rever guia',
    close: 'Fechar',
    steps: {
      home: [
        {
          title: 'Bem-vindo à Plataforma GBA',
          body: 'A plataforma liga candidatos e empregadores inclusivos na GBA com ferramentas de IA, matching e apoio jurídico.',
        },
        {
          title: 'Escolha o portal',
          body: 'Entre como candidato individual ou recrutador empresarial. Ambos partilham a mesma infraestrutura.',
        },
        {
          title: 'Capacidades',
          body: 'Explore CV com IA, preparação para entrevistas, percursos de aprendizagem e recrutamento inclusivo.',
        },
        {
          title: 'Como funciona',
          body: 'Siga o ciclo completo: perfil, matching, candidaturas, entrevistas e acompanhamento pós-contratação.',
        },
        {
          title: 'FAQ',
          body: 'Respostas sobre acesso, doações, segurança de dados e acessibilidade.',
        },
        {
          title: 'Idioma e acessibilidade',
          body: 'Mude entre inglês, chinês e português.',
        },
      ],
      individual: [
        {
          title: 'Guia do portal individual',
          body: 'O painel reúne ferramentas de IA, matching, candidaturas e acesso jurídico/doações.',
        },
        {
          title: 'Painel pessoal',
          body: 'Visão geral das ferramentas e banners de acesso. Complete o perfil antes de começar.',
        },
        {
          title: 'CV inteligente',
          body: 'Carregue CV e descrição da vaga. A IA analisa lacunas e gera uma versão personalizada.',
        },
        {
          title: 'Preparação para entrevista',
          body: 'Pratique perguntas específicas do cargo com feedback da IA.',
        },
        {
          title: 'Matching de vagas',
          body: 'Navegue vagas recomendadas por perfil e pontuação do CV.',
        },
        {
          title: 'Doação e apoio jurídico',
          body: 'Grupos vulneráveis usam gratuitamente. Outros podem doar para desbloquear funcionalidades.',
        },
      ],
      corporate: [
        {
          title: 'Guia do portal empresarial',
          body: 'Gerencie recrutamento inclusivo, publique vagas com critérios-alvo e analise candidatos pontuados.',
        },
        {
          title: 'Painel de recrutamento',
          body: 'Acompanhe métricas de diversidade e estatísticas do pipeline.',
        },
        {
          title: 'Ferramentas de RH',
          body: 'Triagem cega, calculadoras de conformidade, análise DEI e verificação de trabalho remoto.',
        },
        {
          title: 'Minhas vagas',
          body: 'Veja e gira vagas publicadas e monitorize candidaturas.',
        },
        {
          title: 'Publicar vaga',
          body: 'Crie vagas inclusivas com critérios de grupo-alvo para matching preciso.',
        },
        {
          title: 'Idioma',
          body: 'Mude o idioma aqui.',
        },
      ],
    },
  },
};

function deepMerge(target, source) {
  Object.keys(source).forEach((key) => {
    if (
      source[key] &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      target[key] &&
      typeof target[key] === 'object' &&
      !Array.isArray(target[key])
    ) {
      deepMerge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  });
  return target;
}

for (const lang of Object.keys(SITE_GUIDE)) {
  const filePath = path.join(localesDir, `${lang}.json`);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  deepMerge(data, { siteGuide: SITE_GUIDE[lang] });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log(`Updated ${lang}.json with siteGuide keys`);
}
