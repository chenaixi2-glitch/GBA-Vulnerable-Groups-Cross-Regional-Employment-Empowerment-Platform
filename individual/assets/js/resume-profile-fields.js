/**
 * Schema-driven resume profile fields — parse/render/collect structured module data.
 */
const ResumeProfileFields = {
    MODULE_FIELD_SCHEMA: {
        education: [
            { key: 'school', labelKey: 'fieldSchool', widget: 'text', fullWidth: true },
            { key: 'major', labelKey: 'fieldMajor', widget: 'text' },
            { key: 'degree', labelKey: 'fieldDegree', widget: 'text' },
            { key: 'start_date', labelKey: 'startDate', widget: 'text' },
            { key: 'end_date', labelKey: 'endDate', widget: 'text' },
        ],
        internship: [
            { key: 'company', labelKey: 'fieldCompany', widget: 'text', fullWidth: true },
            { key: 'role', labelKey: 'fieldRole', widget: 'text' },
            { key: 'start_date', labelKey: 'startDate', widget: 'text' },
            { key: 'end_date', labelKey: 'endDate', widget: 'text' },
            { key: 'tech_stack', labelKey: 'fieldTechStack', widget: 'tags', fullWidth: true },
            { key: 'responsibilities', labelKey: 'fieldResponsibilities', widget: 'textarea', rows: 4, fullWidth: true },
            { key: 'achievements', labelKey: 'fieldAchievements', widget: 'textarea', rows: 3, fullWidth: true },
        ],
        project: [
            { key: 'title', labelKey: 'fieldProjectTitle', widget: 'text', fullWidth: true },
            { key: 'role', labelKey: 'fieldRole', widget: 'text' },
            { key: 'start_date', labelKey: 'startDate', widget: 'text' },
            { key: 'end_date', labelKey: 'endDate', widget: 'text' },
            { key: 'tech_stack', labelKey: 'fieldTechStack', widget: 'tags', fullWidth: true },
            { key: 'responsibilities', labelKey: 'fieldResponsibilities', widget: 'textarea', rows: 4, fullWidth: true },
            { key: 'achievements', labelKey: 'fieldAchievements', widget: 'textarea', rows: 3, fullWidth: true },
        ],
        skill: [
            { key: 'skill', labelKey: 'skillLabel', widget: 'text', fullWidth: true },
            { key: 'level', labelKey: 'fieldLevel', widget: 'text' },
            { key: 'context', labelKey: 'fieldContext', widget: 'textarea', rows: 2, fullWidth: true },
        ],
        award: [
            { key: 'title', labelKey: 'fieldAwardTitle', widget: 'text', fullWidth: true },
            { key: 'issuer', labelKey: 'fieldIssuer', widget: 'text' },
            { key: 'date', labelKey: 'fieldDate', widget: 'text' },
            { key: 'description', labelKey: 'fieldDescription', widget: 'textarea', rows: 3, fullWidth: true },
        ],
        paper: [
            { key: 'title', labelKey: 'fieldPaperTitle', widget: 'text', fullWidth: true },
            { key: 'venue', labelKey: 'fieldVenue', widget: 'text' },
            { key: 'date', labelKey: 'fieldDate', widget: 'text' },
            { key: 'description', labelKey: 'fieldDescription', widget: 'textarea', rows: 3, fullWidth: true },
        ],
        custom: [
            { key: 'title', labelKey: 'entryTitle', widget: 'text', fullWidth: true },
            { key: 'content', labelKey: 'details', widget: 'textarea', rows: 3, fullWidth: true },
        ],
    },

    FIELD_LABEL_FALLBACKS: {
        fieldSchool: 'School',
        fieldMajor: 'Major',
        fieldDegree: 'Degree',
        startDate: 'Start',
        endDate: 'End',
        fieldCompany: 'Company',
        fieldRole: 'Role / Title',
        fieldTechStack: 'Tech stack',
        fieldResponsibilities: 'Responsibilities',
        fieldAchievements: 'Achievements',
        fieldProjectTitle: 'Project name',
        skillLabel: 'Skill',
        fieldLevel: 'Level',
        fieldContext: 'Context',
        fieldAwardTitle: 'Award',
        fieldIssuer: 'Issuer',
        fieldDate: 'Date',
        fieldPaperTitle: 'Paper title',
        fieldVenue: 'Venue / Journal',
        fieldDescription: 'Description',
        entryTitle: 'Title',
        details: 'Details',
    },

    FIELD_PLACEHOLDER_FALLBACKS: {
        fieldSchool: 'University / School name',
        fieldMajor: 'Major / Field',
        fieldDegree: 'Bachelor / Master…',
        startDate: '2019-09',
        endDate: '2023-06',
        fieldCompany: 'Company name',
        fieldRole: 'Job title / role',
        fieldTechStack: 'Python, React, MySQL',
        fieldResponsibilities: 'Key duties and scope…',
        fieldAchievements: 'Quantified results…',
        fieldProjectTitle: 'Project name',
        skillLabel: 'e.g. Python',
        fieldLevel: 'Advanced / Intermediate',
        fieldContext: 'Where and how you used this skill',
        fieldAwardTitle: 'Award name',
        fieldIssuer: 'Organization',
        fieldDate: '2023-06',
        fieldPaperTitle: 'Paper title',
        fieldVenue: 'Conference / Journal',
        fieldDescription: 'Brief description',
        entryTitle: 'Company / Project name',
        details: 'Role, achievements, technologies…',
    },

    getSchema(type) {
        return this.MODULE_FIELD_SCHEMA[type] || this.MODULE_FIELD_SCHEMA.custom;
    },

    fieldLabel(labelKey) {
        const fallback = this.FIELD_LABEL_FALLBACKS[labelKey] || labelKey;
        if (typeof profileUiText === 'function') {
            return profileUiText(`resume.profileEditor.fields.${labelKey}`, fallback);
        }
        return fallback;
    },

    fieldPlaceholder(labelKey) {
        const fallback = this.FIELD_PLACEHOLDER_FALLBACKS[labelKey] || '';
        if (typeof profileUiText === 'function') {
            return profileUiText(`resume.profileEditor.fields.${labelKey}Placeholder`, fallback);
        }
        return fallback;
    },

    humanizeKey(key) {
        return String(key || '')
            .replace(/_/g, ' ')
            .replace(/\b\w/g, (c) => c.toUpperCase());
    },

    defaultFieldsForType(type) {
        const schema = this.getSchema(type);
        const fields = {};
        schema.forEach((spec) => {
            fields[spec.key] = spec.widget === 'tags' ? [] : '';
        });
        return fields;
    },

    coerceFieldValue(key, value) {
        if (key === 'tech_stack') {
            if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
            if (typeof value === 'string' && value.trim()) {
                return value.split(',').map((s) => s.trim()).filter(Boolean);
            }
            return [];
        }
        if (value == null) return '';
        return typeof value === 'string' ? value : String(value);
    },

    parseFactContent(type, content, title = '') {
        const fields = this.defaultFieldsForType(type);
        const text = (content || '').trim();
        const parsedTitle = (title || '').trim();

        if (text) {
            try {
                const parsed = JSON.parse(text);
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                    Object.keys(parsed).forEach((key) => {
                        fields[key] = this.coerceFieldValue(key, parsed[key]);
                    });
                    if ((type === 'internship' || type === 'project') && fields.content && !fields.responsibilities) {
                        fields.responsibilities = fields.content;
                        delete fields.content;
                    }
                }
            } catch (_) {
                if (type === 'skill') {
                    fields.skill = text;
                } else if (type === 'internship') {
                    fields.company = parsedTitle || text.split('\n', 1)[0];
                    fields.responsibilities = text.includes('\n') ? text.split('\n').slice(1).join('\n').trim() : text;
                } else if (type === 'project') {
                    fields.title = parsedTitle || text.split('\n', 1)[0];
                    fields.responsibilities = text.includes('\n') ? text.split('\n').slice(1).join('\n').trim() : text;
                } else {
                    fields.content = text;
                }
            }
        } else if (parsedTitle) {
            if (type === 'skill') fields.skill = parsedTitle;
            else if (type === 'internship') fields.company = parsedTitle;
            else if (type === 'project') fields.title = parsedTitle;
            else fields.title = parsedTitle;
        }

        if (type === 'internship' && !fields.company && fields.title && !fields.role) {
            fields.company = fields.title;
        }
        if (type === 'internship' && fields.company && fields.title
            && !fields.role && fields.title !== fields.company) {
            // Profile LLM often puts job title in `title` and leaves `role` empty.
            fields.role = fields.title;
        }
        if (type === 'project' && !fields.title && fields.company) {
            fields.title = fields.company;
        }
        return fields;
    },

    getEntryFields(type, entry) {
        if (entry && entry.fields && typeof entry.fields === 'object' && Object.keys(entry.fields).length) {
            const merged = this.defaultFieldsForType(type);
            Object.keys(entry.fields).forEach((key) => {
                merged[key] = this.coerceFieldValue(key, entry.fields[key]);
            });
            // Reuse parseFactContent normalization (title → role).
            return this.parseFactContent(type, JSON.stringify(merged));
        }
        if (type === 'education') {
            return {
                school: entry.school || '',
                major: entry.major || '',
                degree: entry.degree || '',
                start_date: entry.start_date || '',
                end_date: entry.end_date || '',
            };
        }
        return this.parseFactContent(type, entry.content || '', entry.title || '');
    },

    fieldsToFactContent(type, fields) {
        const clean = {};
        Object.entries(fields || {}).forEach(([key, value]) => {
            if (key === 'tech_stack') {
                const stack = Array.isArray(value) ? value : [];
                if (stack.length) clean[key] = stack;
                return;
            }
            const text = String(value || '').trim();
            if (text) clean[key] = text;
        });
        return Object.keys(clean).length ? JSON.stringify(clean) : '';
    },

    deriveTitleContent(type, fields) {
        const formatRange = (start, end) => {
            const s = String(start || '').trim();
            const e = String(end || '').trim();
            if (s && e) return `${s} – ${e}`;
            return s || e;
        };
        const withDates = (head, f) => {
            const range = formatRange(f.start_date || f.date, f.end_date);
            const title = String(head || '').trim();
            if (!range) return title;
            if ((f.start_date && title.includes(String(f.start_date)))
                || (f.end_date && title.includes(String(f.end_date)))
                || (f.date && title.includes(String(f.date)))) {
                return title;
            }
            return title ? `${title} (${range})` : range;
        };
        if (type === 'internship') {
            const company = String(fields.company || '').trim();
            let role = String(fields.role || '').trim();
            const titleField = String(fields.title || '').trim();
            if (!role && titleField && titleField !== company) role = titleField;
            const companyName = company || (titleField && titleField !== role ? titleField : '');
            const head = companyName && role ? `${companyName} — ${role}` : (companyName || role);
            const parts = [fields.responsibilities, fields.achievements]
                .map((p) => String(p || '').trim())
                .filter(Boolean);
            if (role && !companyName) parts.unshift(role);
            return { title: withDates(head, fields), content: parts.join('\n\n') };
        }
        if (type === 'project') {
            const name = String(fields.title || fields.name || '').trim();
            const role = String(fields.role || '').trim();
            const head = name && role ? `${name} — ${role}` : (name || role);
            const parts = [fields.responsibilities, fields.achievements]
                .map((p) => String(p || '').trim())
                .filter(Boolean);
            if (role && !name) parts.unshift(role);
            return { title: withDates(head, fields), content: parts.join('\n\n') };
        }
        if (type === 'skill') {
            return {
                title: String(fields.skill || '').trim(),
                content: String(fields.level || fields.context || '').trim(),
            };
        }
        return {
            title: withDates(String(fields.title || fields.company || fields.skill || '').trim(), fields),
            content: String(fields.content || fields.description || fields.responsibilities || '').trim(),
        };
    },

    formatFieldValue(spec, value) {
        if (spec.widget === 'tags') {
            return Array.isArray(value) ? value.join(', ') : String(value || '');
        }
        return String(value == null ? '' : value);
    },

    parseFieldInput(spec, raw) {
        if (spec.widget === 'tags') {
            return String(raw || '')
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean);
        }
        return String(raw || '').trim();
    },

    buildFieldSpecs(type, fields) {
        const schema = this.getSchema(type);
        const known = new Set(schema.map((s) => s.key));
        const specs = schema.slice();
        Object.keys(fields || {}).forEach((key) => {
            if (known.has(key)) return;
            const val = fields[key];
            if (val == null || val === '' || (Array.isArray(val) && !val.length)) return;
            specs.push({
                key,
                labelKey: null,
                widget: Array.isArray(val) ? 'tags' : (String(val).includes('\n') ? 'textarea' : 'text'),
                fullWidth: true,
                dynamic: true,
            });
        });
        return specs;
    },

    renderFieldInput(spec, value, escapeHtml, readonlyAttr) {
        const label = spec.labelKey
            ? this.fieldLabel(spec.labelKey)
            : this.humanizeKey(spec.key);
        const placeholder = spec.labelKey
            ? this.fieldPlaceholder(spec.labelKey)
            : '';
        const display = this.formatFieldValue(spec, value);
        const colClass = spec.fullWidth ? 'sm:col-span-2' : '';
        const common = `data-field-key="${spec.key}" class="w-full border border-gray-300 rounded-lg p-2 text-sm" ${readonlyAttr}`;
        let control;
        if (spec.widget === 'textarea') {
            control = `<textarea ${common} rows="${spec.rows || 3}" placeholder="${escapeHtml(placeholder)}">${escapeHtml(display)}</textarea>`;
        } else {
            control = `<input type="text" ${common} value="${escapeHtml(display)}" placeholder="${escapeHtml(placeholder)}">`;
        }
        return `
        <div class="${colClass}">
            <label class="block text-xs text-gray-500 mb-1">${escapeHtml(label)}</label>
            ${control}
        </div>`;
    },

    renderFieldsGrid(type, fields, escapeHtml, readonlyAttr = '') {
        const specs = this.buildFieldSpecs(type, fields);
        return `<div class="grid sm:grid-cols-2 gap-2">${specs
            .map((spec) => this.renderFieldInput(spec, fields[spec.key], escapeHtml, readonlyAttr))
            .join('')}</div>`;
    },

    collectFieldsFromCard(card) {
        const fields = {};
        card.querySelectorAll('[data-field-key]').forEach((input) => {
            const key = input.dataset.fieldKey;
            const widget = input.tagName === 'TEXTAREA' ? 'textarea'
                : (key === 'tech_stack' ? 'tags' : 'text');
            fields[key] = this.parseFieldInput({ key, widget }, input.value);
        });
        return fields;
    },

    applyFieldsToCard(card, fields, markTranslated) {
        if (!card || !fields) return;
        card.querySelectorAll('[data-field-key]').forEach((input) => {
            const key = input.dataset.fieldKey;
            if (!(key in fields)) return;
            const widget = input.tagName === 'TEXTAREA' ? 'textarea'
                : (key === 'tech_stack' ? 'tags' : 'text');
            const nextVal = this.formatFieldValue({ key, widget }, fields[key]);
            if (String(input.value || '') !== nextVal && typeof markTranslated === 'function') {
                markTranslated(input, input.value);
            }
            input.value = nextVal;
        });
    },

    applyApiResultToFields(type, currentFields, result) {
        if (result && result.fields && typeof result.fields === 'object') {
            const merged = { ...currentFields };
            Object.keys(result.fields).forEach((key) => {
                if (key in merged || String(result.fields[key] || '').trim()) {
                    merged[key] = result.fields[key];
                }
            });
            return merged;
        }
        if (type === 'education') {
            return {
                ...currentFields,
                school: result.school ?? currentFields.school,
                major: result.major ?? currentFields.major,
                degree: result.degree ?? currentFields.degree,
            };
        }
        const merged = { ...currentFields };
        if (type === 'internship') {
            if (result.title) merged.company = result.title;
            if (result.content) merged.responsibilities = result.content;
        } else if (type === 'project') {
            if (result.title) merged.title = result.title;
            if (result.content) merged.responsibilities = result.content;
        } else {
            if (result.title) merged.title = result.title;
            if (result.content) merged.content = result.content;
        }
        return merged;
    },
};

if (typeof window !== 'undefined') {
    window.ResumeProfileFields = ResumeProfileFields;
}
