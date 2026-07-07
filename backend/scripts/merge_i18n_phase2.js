/**
 * Phase 2 i18n: missing locale keys + applyStaticStrings expansions.
 * Run: node backend/scripts/merge_i18n_phase2.js
 */
const fs = require('fs');
const path = require('path');

const localesDir = path.join(__dirname, '..', '..', 'assets', 'i18n', 'locales');

const SUPPLEMENT = {
  'zh-CN': {
    resume: {
      savedRecordsTitle: '已保存的资料',
      savedRecordsRefresh: '刷新',
      savedRecordsHint: '每次保存为独立记录。上传新简历仅替换当前工作副本。',
      savedRecordsEmpty: '暂无已保存资料。点击「保存到账户」创建一条记录。',
      exportPdf: 'PDF',
      exportDocx: 'DOCX',
      exportHtml: 'HTML',
      exportMarkdown: 'Markdown',
      exportPlainText: '纯文本',
      exportWord: 'Word',
      chineseResumes: '中文简历',
      englishResumes: '英文简历',
    },
    interview: {
      selectEmployerType: '单位性质',
      selectExperienceLevel: '经验等级',
      specialTechnical: '只练技术/专业题',
      specialNegotiation: '只练终面谈判',
      specialDeepDive: '只练简历深挖',
      confirmEndInterview: '结束模拟面试并生成复盘报告？',
      confirmSaveInterview: '将此模拟面试与复盘保存到您的账户？',
      confirmNewSession: '开始新的面试会话？当前进度将丢失。',
    },
    matching: {
      step1Note:
        '说明：真实 PDF/DOC 解析在后端（OCR、脱敏）。此流程可拖入样本或粘贴纯文本。',
    },
    strings: {
      PDF: 'PDF',
      Word: 'Word',
      DOCX: 'DOCX',
      'Plain text': '纯文本',
      Markdown: 'Markdown',
      'extracts text only': '仅提取文字',
      'Chinese resumes': '中文简历',
      'English resumes': '英文简历',
      'Simplified Chinese': '简体中文',
      'Traditional Chinese': '繁体中文',
      English: 'English',
      Portuguese: 'Portuguese',
      Português: 'Português',
      'Technology & Software': '科技与软件',
      'Finance & Banking': '金融与银行',
      'E-commerce & Retail': '电商与零售',
      'Healthcare & Medical': '医疗与健康',
      'Education & Training': '教育与培训',
      Manufacturing: '制造业',
      'State-owned (国央企)': '国央企',
      'Public Sector (体制内)': '体制内',
      'Foreign Enterprise (外企)': '外企',
      'Private Enterprise (民企)': '民企',
      'Non-profit (NPO/NGO)': '非营利组织（NPO/NGO）',
      'HK/Macau/TW-funded (港澳台资)': '港澳台资企业',
      'Other (其他)': '其他',
      'Employer type / 单位性质': '单位性质',
      'Experience level / 经验等级': '经验等级',
      'Entry Level': '初级',
      'Mid Level': '中级',
      'Senior Level': '高级',
      Executive: '管理层',
      Technology: '科技',
      Finance: '金融',
      'E-commerce': '电商',
      Healthcare: '医疗',
      Education: '教育',
      Note: '说明',
    },
  },
};

const ZH_TW_OVERRIDES = {
  resume: {
    savedRecordsTitle: '已保存的資料',
    savedRecordsRefresh: '重新整理',
    savedRecordsHint: '每次保存為獨立記錄。上傳新履歷僅替換目前工作副本。',
    savedRecordsEmpty: '暫無已保存資料。點擊「保存到帳戶」建立一筆記錄。',
    exportPlainText: '純文字',
    chineseResumes: '中文履歷',
    englishResumes: '英文履歷',
  },
  interview: {
    selectEmployerType: '單位性質',
    selectExperienceLevel: '經驗等級',
    specialTechnical: '只練技術/專業題',
    specialNegotiation: '只練終面談判',
    specialDeepDive: '只練履歷深挖',
    confirmEndInterview: '結束模擬面試並生成復盤報告？',
    confirmSaveInterview: '將此模擬面試與復盤保存到您的帳戶？',
    confirmNewSession: '開始新的面試會話？目前進度將遺失。',
  },
  matching: {
    step1Note:
      '說明：真實 PDF/DOC 解析在後端（OCR、脫敏）。此流程可拖入樣本或貼上純文字。',
  },
  strings: {
    'Plain text': '純文字',
    'Chinese resumes': '中文履歷',
    'English resumes': '英文履歷',
    'Simplified Chinese': '簡體中文',
    'Traditional Chinese': '繁體中文',
    'Technology & Software': '科技與軟體',
    'Finance & Banking': '金融與銀行',
    'E-commerce & Retail': '電商與零售',
    'Healthcare & Medical': '醫療與健康',
    'Education & Training': '教育與培訓',
    Manufacturing: '製造業',
    'State-owned (国央企)': '國央企',
    'Public Sector (体制内)': '體制內',
    'Foreign Enterprise (外企)': '外企',
    'Private Enterprise (民企)': '民企',
    'Non-profit (NPO/NGO)': '非營利組織（NPO/NGO）',
    'HK/Macau/TW-funded (港澳台资)': '港澳台資企業',
    'Other (其他)': '其他',
    'Employer type / 单位性质': '單位性質',
    'Experience level / 经验等级': '經驗等級',
    'Entry Level': '初級',
    'Mid Level': '中級',
    'Senior Level': '高級',
    Executive: '管理層',
    Note: '說明',
  },
};

const PT_OVERRIDES = {
  resume: {
    savedRecordsTitle: 'Perfis guardados',
    savedRecordsRefresh: 'Atualizar',
    savedRecordsHint: 'Cada gravação é um registo separado. Carregar um novo CV substitui apenas a cópia de trabalho atual.',
    savedRecordsEmpty: 'Ainda não há perfis guardados. Clique em «Guardar na conta» para criar um.',
    exportPdf: 'PDF',
    exportDocx: 'DOCX',
    exportHtml: 'HTML',
    exportMarkdown: 'Markdown',
    exportPlainText: 'Texto simples',
    exportWord: 'Word',
    chineseResumes: 'CV em chinês',
    englishResumes: 'CV em inglês',
  },
  interview: {
    selectEmployerType: 'Tipo de empregador',
    selectExperienceLevel: 'Nível de experiência',
    specialTechnical: 'Só questões técnicas/profissionais',
    specialNegotiation: 'Só negociação de entrevista final',
    specialDeepDive: 'Só aprofundamento de CV',
    confirmEndInterview: 'Terminar a entrevista simulada e gerar relatório de debrief?',
    confirmSaveInterview: 'Guardar esta entrevista simulada e debrief na sua conta?',
    confirmNewSession: 'Iniciar nova sessão de entrevista? O progresso atual será perdido.',
  },
  matching: {
    step1Note:
      'Nota: a ingestão real de PDF/DOC corre no backend (OCR, remoção de PII). Arraste uma amostra ou cole texto simples neste fluxo.',
  },
  strings: {
    PDF: 'PDF',
    Word: 'Word',
    DOCX: 'DOCX',
    'Plain text': 'Texto simples',
    Markdown: 'Markdown',
    'extracts text only': 'extrai apenas texto',
    'Chinese resumes': 'CV em chinês',
    'English resumes': 'CV em inglês',
    'Simplified Chinese': 'Chinês simplificado',
    'Traditional Chinese': 'Chinês tradicional',
    English: 'Inglês',
    Portuguese: 'Português',
    Português: 'Português',
    'Technology & Software': 'Tecnologia e software',
    'Finance & Banking': 'Finanças e banca',
    'E-commerce & Retail': 'Comércio eletrónico e retalho',
    'Healthcare & Medical': 'Saúde e medicina',
    'Education & Training': 'Educação e formação',
    Manufacturing: 'Indústria',
    'State-owned (国央企)': 'Empresa estatal',
    'Public Sector (体制内)': 'Setor público',
    'Foreign Enterprise (外企)': 'Empresa estrangeira',
    'Private Enterprise (民企)': 'Empresa privada',
    'Non-profit (NPO/NGO)': 'Sem fins lucrativos (NPO/NGO)',
    'HK/Macau/TW-funded (港澳台资)': 'Financiamento HK/Macau/TW',
    'Other (其他)': 'Outro',
    'Employer type / 单位性质': 'Tipo de empregador',
    'Experience level / 经验等级': 'Nível de experiência',
    'Entry Level': 'Nível inicial',
    'Mid Level': 'Nível intermédio',
    'Senior Level': 'Nível sénior',
    Executive: 'Executivo',
    Technology: 'Tecnologia',
    Finance: 'Finanças',
    'E-commerce': 'Comércio eletrónico',
    Healthcare: 'Saúde',
    Education: 'Educação',
    Note: 'Nota',
  },
};

function deepMerge(target, source) {
  Object.keys(source).forEach((key) => {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      if (!target[key] || typeof target[key] !== 'object') target[key] = {};
      deepMerge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  });
  return target;
}

function toTraditional(obj) {
  if (typeof obj === 'string') {
    return obj
      .replace(/语言/g, '語言')
      .replace(/说明/g, '說明')
      .replace(/资料/g, '資料')
      .replace(/简历/g, '履歷')
      .replace(/账户/g, '帳戶')
      .replace(/刷新/g, '重新整理')
      .replace(/软件/g, '軟體')
      .replace(/银行/g, '銀行')
      .replace(/电商/g, '電商')
      .replace(/医疗/g, '醫療')
      .replace(/培训/g, '培訓')
      .replace(/制造/g, '製造')
      .replace(/国央企/g, '國央企')
      .replace(/体制内/g, '體制內')
      .replace(/港澳台资/g, '港澳台資')
      .replace(/练/g, '練')
      .replace(/专/g, '專')
      .replace(/终/g, '終')
      .replace(/历/g, '歷')
      .replace(/级/g, '級')
      .replace(/纯文本/g, '純文字');
  }
  if (Array.isArray(obj)) return obj.map(toTraditional);
  if (obj && typeof obj === 'object') {
    const out = {};
    Object.keys(obj).forEach((k) => { out[k] = toTraditional(obj[k]); });
    return out;
  }
  return obj;
}

['zh-CN', 'zh-TW', 'pt'].forEach((lang) => {
  const filePath = path.join(localesDir, lang + '.json');
  const existing = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  let supplement = SUPPLEMENT['zh-CN'];
  if (lang === 'zh-TW') {
    supplement = deepMerge(toTraditional(SUPPLEMENT['zh-CN']), ZH_TW_OVERRIDES);
  }
  if (lang === 'pt') {
    supplement = deepMerge(JSON.parse(JSON.stringify(SUPPLEMENT['zh-CN'])), PT_OVERRIDES);
  }
  deepMerge(existing, supplement);
  fs.writeFileSync(filePath, JSON.stringify(existing, null, 2) + '\n', 'utf8');
  console.log('Updated', filePath);
});

console.log('Done.');
