// IntelliJ-style writing help for the plain textarea editor.
// The textarea keeps its native value contract; this module only listens to it,
// shows a positioned suggestion popup, and edits through setRangeText.

import { METHOD_GROUPS, RECEIVER_TYPES } from './refreshers.mjs';

const OPENERS = { '(': ')', '[': ']', '{': '}', '"': '"' };
const CLOSERS = new Set([')', ']', '}', '"']);
const IDENTIFIER = /[\w$]/;
const KEYWORDS = [
  'abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch', 'char',
  'class', 'const', 'continue', 'default', 'do', 'double', 'else', 'enum',
  'extends', 'final', 'finally', 'float', 'for', 'if', 'implements', 'import',
  'instanceof', 'int', 'interface', 'long', 'native', 'new', 'package',
  'private', 'protected', 'public', 'record', 'return', 'short', 'static',
  'strictfp', 'super', 'switch', 'synchronized', 'this', 'throw', 'throws',
  'transient', 'try', 'var', 'void', 'volatile', 'while', 'true', 'false', 'null',
];
const TEMPLATES = [
  {
    name: 'psvm',
    description: 'public static void main method',
    text: 'public static void main(String[] args) {\n    $0\n}',
  },
  {
    name: 'sout',
    description: 'Print a value to standard output',
    text: 'System.out.println($0);',
  },
  {
    name: 'soutv',
    description: 'Print a labelled value',
    text: 'System.out.println("value = " + $0);',
  },
  {
    name: 'fori',
    description: 'Indexed for loop',
    text: 'for (int i = 0; i < $0; i++) {\n    \n}',
  },
  {
    name: 'iter',
    description: 'Enhanced for loop over a collection',
    text: 'for (var item : $0) {\n    \n}',
  },
];
const GROUP_METHODS = new Map(
  METHOD_GROUPS.map((group) => [
    group.id,
    group.methods.map((method) => ({ ...method, groupId: group.id, groupTitle: group.title })),
  ]),
);

function isCallable(entry) {
  return entry.kind !== 'field' && !/^[A-Z_]+\s*$/.test(entry.signature || entry.name);
}

function insertionFor(entry) {
  const name = entry.name;
  if (entry.kind === 'field' || entry.kind === 'variable' || entry.kind === 'keyword' || entry.kind === 'type') {
    return { insert: name, caretOffset: name.length };
  }
  const signature = entry.signature || '';
  const params = signature.slice(signature.indexOf('(') + 1, signature.lastIndexOf(')')).trim();
  if (params.length > 0) {
    const insert = `${name}()`;
    return { insert, caretOffset: name.length + 1 };
  }
  const insert = `${name}()`;
  return { insert, caretOffset: insert.length };
}

function makeSuggestion(entry, score) {
  const insertion = insertionFor(entry);
  return {
    name: entry.name,
    signature: entry.signature || (isCallable(entry) ? `${entry.name}()` : entry.name),
    returns: entry.returns || '',
    description: entry.description || '',
    kind: entry.kind || 'method',
    score,
    insert: insertion.insert,
    caretOffset: insertion.caretOffset,
  };
}

function splitTopLevel(text, separator) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '<' || char === '(' || char === '[') depth += 1;
    else if (char === '>' || char === ')' || char === ']') depth = Math.max(0, depth - 1);
    else if (char === separator && depth === 0) {
      parts.push(text.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map((part) => part.trim()).filter(Boolean);
}

function stripNoise(source) {
  let out = '';
  let index = 0;
  let state = 'code';
  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];
    if (state === 'code') {
      if (char === '/' && next === '/') {
        state = 'line';
        out += '  ';
        index += 2;
        continue;
      }
      if (char === '/' && next === '*') {
        state = 'block';
        out += '  ';
        index += 2;
        continue;
      }
      if (char === '"') {
        state = 'string';
        out += ' ';
        index += 1;
        continue;
      }
      if (char === "'") {
        state = 'char';
        out += ' ';
        index += 1;
        continue;
      }
      out += char;
      index += 1;
      continue;
    }
    if (state === 'line') {
      if (char === '\n') {
        state = 'code';
        out += '\n';
      } else {
        out += ' ';
      }
      index += 1;
      continue;
    }
    if (state === 'block') {
      if (char === '*' && next === '/') {
        state = 'code';
        out += '  ';
        index += 2;
      } else {
        out += char === '\n' ? '\n' : ' ';
        index += 1;
      }
      continue;
    }
    if (char === '\\') {
      out += '  ';
      index += 2;
      continue;
    }
    if ((state === 'string' && char === '"') || (state === 'char' && char === "'")) {
      state = 'code';
      out += ' ';
      index += 1;
      continue;
    }
    out += char === '\n' ? '\n' : ' ';
    index += 1;
  }
  return out;
}

function findMatching(text, openIndex, open, close) {
  let depth = 0;
  for (let index = openIndex; index < text.length; index += 1) {
    if (text[index] === open) depth += 1;
    else if (text[index] === close) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function baseTypeName(type) {
  if (!type) return '';
  return String(type).replace(/\[\]/g, '').replace(/<.*>/g, '').trim();
}

function genericArguments(type) {
  const match = String(type || '').match(/<([^<>]*)>/);
  return match ? splitTopLevel(match[1], ',') : [];
}

function collectModel(source) {
  const clean = stripNoise(source);
  const bindings = new Map();
  const types = new Map();
  const methodReturns = new Map();

  const bindingSource = clean.replace(/\brecord\s+[A-Z_$][\w$]*\s*\([^)]*\)/g, (match) => ' '.repeat(match.length));
  const primitive = 'byte|short|int|long|float|double|boolean|char|void';
  const typePattern = `(?:${primitive}|[A-Z][\\w$]*(?:\\.[A-Z][\\w$]*)*)(?:\\s*<[^;{}()]*>)?(?:\\[\\])*`;
  const declaration = new RegExp(
    `(?:^|[;{}(,]\\s*)(?:(?:final|static|private|public|protected|abstract|transient|volatile)\\s+)*(${typePattern})\\s+([a-z_$][\\w$]*)\\s*(?==|;|,|:|\\))`,
    'gm',
  );
  for (const match of bindingSource.matchAll(declaration)) {
    bindings.set(match[2], match[1].replace(/\s+/g, ' '));
  }

  const typeDeclaration = /\b(class|interface|enum|record)\s+([A-Z_$][\w$]*)/g;
  let typeMatch;
  while ((typeMatch = typeDeclaration.exec(clean))) {
    const kind = typeMatch[1];
    const name = typeMatch[2];
    const members = types.get(name) || new Map();

    if (kind === 'record') {
      const open = clean.indexOf('(', typeMatch.index);
      if (open !== -1) {
        const close = findMatching(clean, open, '(', ')');
        if (close !== -1) {
          for (const component of splitTopLevel(clean.slice(open + 1, close), ',')) {
            const parsed = component.match(/^([A-Za-z_$][\w$.]*(?:\s*<[^;{}()]*>)?(?:\[\])*)\s+([A-Za-z_$][\w$]*)$/);
            if (!parsed) continue;
            members.set(parsed[2], {
              name: parsed[2],
              kind: 'method',
              signature: `${parsed[2]}()`,
              returns: parsed[1],
              description: `Reads the ${parsed[2]} component of ${name}.`,
            });
          }
        }
      }
    }

    const bodyStart = clean.indexOf('{', typeMatch.index);
    if (bodyStart !== -1) {
      const bodyEnd = findMatching(clean, bodyStart, '{', '}');
      if (bodyEnd !== -1) {
        const body = clean.slice(bodyStart + 1, bodyEnd);
        const fieldPattern = /(?:^|[;{}]\s*)(?:(?:public|private|protected|static|final|transient|volatile)\s+)*([A-Za-z_$][\w$.]*(?:\s*<[^;{}()]*>)?(?:\[\])*)\s+([A-Za-z_$][\w$]*)\s*(?==|;)/gm;
        for (const field of body.matchAll(fieldPattern)) {
          members.set(field[2], {
            name: field[2],
            kind: 'field',
            signature: field[2],
            returns: field[1].replace(/\s+/g, ' '),
            description: `Field declared in ${name}.`,
          });
        }
        const methodPattern = /(?:^|[;{}]\s*)(?:(?:public|private|protected|static|final|abstract|synchronized|native|default)\s+)*([A-Za-z_$][\w$.]*(?:\s*<[^;{}()]*>)?(?:\[\])*|void)\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*(?:throws\s+[^{]+)?\{/gm;
        for (const method of body.matchAll(methodPattern)) {
          const returnType = method[1].replace(/\s+/g, ' ');
          const params = method[3].trim();
          members.set(method[2], {
            name: method[2],
            kind: 'method',
            signature: `${method[2]}(${params})`,
            returns: returnType,
            description: `Method declared in ${name}.`,
          });
          if (!methodReturns.has(method[2])) methodReturns.set(method[2], returnType);
        }
      }
    }
    types.set(name, members);
  }

  return { bindings, types, methodReturns };
}

function extractReceiverExpression(beforeCaret) {
  let index = beforeCaret.length - 1;
  while (index >= 0 && /\s/.test(beforeCaret[index])) index -= 1;
  let depth = 0;
  while (index >= 0) {
    const char = beforeCaret[index];
    if (char === ')') {
      depth += 1;
      index -= 1;
      continue;
    }
    if (char === '(') {
      if (depth === 0) break;
      depth -= 1;
      index -= 1;
      continue;
    }
    if (IDENTIFIER.test(char) || char === '.' || char === '[' || char === ']' || char === '>') {
      index -= 1;
      continue;
    }
    break;
  }
  return beforeCaret.slice(index + 1).trim();
}

function splitChain(expression) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < expression.length; index += 1) {
    const char = expression[index];
    if (char === '(' || char === '[' || char === '<') depth += 1;
    else if (char === ')' || char === ']' || char === '>') depth = Math.max(0, depth - 1);
    else if (char === '.' && depth === 0) {
      parts.push(expression.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(expression.slice(start));
  return parts.map((part) => part.trim()).filter(Boolean);
}

function memberReturnType(currentType, memberName, model) {
  const base = baseTypeName(currentType);
  const declared = model.types.get(base);
  if (declared?.has(memberName)) return declared.get(memberName).returns;
  const groupId = RECEIVER_TYPES[base];
  if (groupId) {
    const entry = (GROUP_METHODS.get(groupId) || []).find((method) => method.name === memberName);
    if (entry) {
      const args = genericArguments(currentType);
      if (entry.returns === 'E') return args[0] || 'Object';
      if (entry.returns === 'V') return args[1] || args[0] || 'Object';
      if (entry.returns === 'K') return args[0] || 'Object';
      return entry.returns;
    }
  }
  return null;
}

function resolveReceiverType(beforeCaret, model) {
  const expression = extractReceiverExpression(beforeCaret);
  if (!expression) return null;
  const parts = splitChain(expression);
  let current = null;
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    const call = part.match(/^([A-Za-z_$][\w$]*)\s*\(([^)]*)\)$/);
    const name = call ? call[1] : part;
    if (index === 0) {
      if (call) current = model.methodReturns.get(name) || null;
      else current = model.bindings.get(name) || (model.types.has(name) ? name : (RECEIVER_TYPES[name] ? name : null));
    } else {
      current = current ? memberReturnType(current, name, model) : null;
    }
    if (!current) return null;
  }
  return current;
}

function memberSuggestions(typeName, model) {
  const base = baseTypeName(typeName);
  const suggestions = [];
  const declared = model.types.get(base);
  if (declared) {
    for (const member of declared.values()) {
      suggestions.push(makeSuggestion({
        name: member.name,
        signature: member.signature || member.name,
        returns: member.returns || '',
        description: member.description,
        kind: member.kind || 'method',
      }, 120));
    }
  }
  const groupId = RECEIVER_TYPES[base];
  if (groupId) {
    for (const method of GROUP_METHODS.get(groupId) || []) {
      suggestions.push(makeSuggestion(method, 70));
    }
  }
  return suggestions;
}

function generalSuggestions(model) {
  const suggestions = [];
  for (const [name, type] of model.bindings) {
    suggestions.push({
      name,
      signature: name,
      returns: type,
      description: `In-scope variable of type ${type}.`,
      kind: 'variable',
      insert: name,
      caretOffset: name.length,
      score: 90,
    });
  }
  for (const name of model.types.keys()) {
    suggestions.push({
      name,
      signature: name,
      returns: 'type',
      description: 'Type declared in this editor.',
      kind: 'type',
      insert: name,
      caretOffset: name.length,
      score: 88,
    });
  }
  for (const template of TEMPLATES) {
    suggestions.push({
      name: template.name,
      signature: template.name,
      returns: 'template',
      description: template.description,
      kind: 'template',
      template,
      score: 78,
    });
  }
  for (const keyword of KEYWORDS) {
    suggestions.push({
      name: keyword,
      signature: keyword,
      returns: 'keyword',
      description: 'Java keyword.',
      kind: 'keyword',
      insert: keyword,
      caretOffset: keyword.length,
      score: 40,
    });
  }
  return suggestions;
}

function dedupe(suggestions) {
  const byName = new Map();
  for (const suggestion of suggestions) {
    const existing = byName.get(suggestion.name);
    if (!existing || suggestion.score > existing.score) byName.set(suggestion.name, suggestion);
  }
  return [...byName.values()];
}

function filterList(suggestions, token) {
  const needle = token.toLowerCase();
  let matches = suggestions.filter((suggestion) => suggestion.name.toLowerCase().startsWith(needle));
  if (!matches.length) matches = suggestions.filter((suggestion) => suggestion.name.toLowerCase().includes(needle));
  return matches
    .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name))
    .slice(0, 60);
}

function templateInsertion(template, value, selectionStart) {
  const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
  const lineIndent = (value.slice(lineStart, selectionStart).match(/^\s*/) || [''])[0];
  const marker = template.text.indexOf('$0');
  const before = template.text.slice(0, marker).replace(/\n/g, `\n${lineIndent}`);
  const after = template.text.slice(marker + 2).replace(/\n/g, `\n${lineIndent}`);
  return { insert: before + after, caretOffset: before.length };
}

export function createEditorAssist({ editor, popup, onStateChange = () => {} }) {
  let enabled = true;
  let options = [];
  let selected = 0;
  let range = { start: 0, end: 0 };
  let compositionActive = false;
  let suppressNextInput = false;
  let lastTrigger = null;

  const isVisible = () => !popup.classList.contains('hidden');

  function suppressInputOnce() {
    suppressNextInput = true;
    setTimeout(() => {
      suppressNextInput = false;
    }, 0);
  }

  function notify() {
    onStateChange({ enabled, visible: isVisible() });
  }

  function close() {
    if (!options.length && !isVisible()) return;
    options = [];
    selected = 0;
    lastTrigger = null;
    popup.classList.add('hidden');
    popup.innerHTML = '';
    editor.setAttribute('aria-expanded', 'false');
    editor.removeAttribute('aria-activedescendant');
    notify();
  }

  function setCaret(position, end = position) {
    editor.setSelectionRange(position, end);
  }

  function replace(start, end, text) {
    editor.setRangeText(text, start, end, 'end');
  }

  function updateSelection() {
    const items = popup.querySelectorAll('[role="option"]');
    items.forEach((item, index) => {
      const active = index === selected;
      item.setAttribute('aria-selected', active ? 'true' : 'false');
      item.classList.toggle('active', active);
      if (active) item.scrollIntoView({ block: 'nearest' });
    });
    const activeItem = items[selected];
    if (activeItem) editor.setAttribute('aria-activedescendant', activeItem.id);
    else editor.removeAttribute('aria-activedescendant');
  }

  function caretCoordinates() {
    const style = window.getComputedStyle(editor);
    const mirror = document.createElement('div');
    const properties = [
      'boxSizing', 'width', 'height', 'overflowX', 'overflowY',
      'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
      'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
      'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight',
      'letterSpacing', 'textTransform', 'textIndent', 'wordSpacing', 'tabSize',
    ];
    for (const property of properties) mirror.style[property] = style[property];
    mirror.style.position = 'fixed';
    mirror.style.visibility = 'hidden';
    mirror.style.whiteSpace = 'pre';
    mirror.style.wordWrap = 'normal';
    mirror.style.overflow = 'hidden';
    const editorRect = editor.getBoundingClientRect();
    mirror.style.left = `${editorRect.left}px`;
    mirror.style.top = `${editorRect.top}px`;
    mirror.style.width = `${editorRect.width}px`;
    mirror.textContent = editor.value.slice(0, editor.selectionStart);
    const marker = document.createElement('span');
    marker.textContent = '\u200b';
    mirror.appendChild(marker);
    document.body.appendChild(mirror);
    const markerRect = marker.getBoundingClientRect();
    const lineHeight = Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) * 1.5 || 20;
    document.body.removeChild(mirror);
    const wrapper = popup.parentElement;
    const wrapperRect = wrapper.getBoundingClientRect();
    const left = editorRect.left - wrapperRect.left + (markerRect.left - editorRect.left) - editor.scrollLeft;
    const top = editorRect.top - wrapperRect.top + (markerRect.top - editorRect.top) - editor.scrollTop + lineHeight;
    return { left, top, lineHeight };
  }

  function positionPopup() {
    if (!isVisible()) return;
    const wrapper = popup.parentElement;
    const { left, top } = caretCoordinates();
    const maxLeft = Math.max(4, wrapper.clientWidth - popup.offsetWidth - 4);
    popup.style.left = `${Math.max(4, Math.min(left, maxLeft))}px`;
    const wrapperTop = wrapper.getBoundingClientRect().top;
    const roomBelow = window.innerHeight - wrapperTop - top - 8;
    if (roomBelow < Math.min(popup.offsetHeight, 180) && top > popup.offsetHeight + 8) {
      popup.style.top = `${Math.max(4, top - popup.offsetHeight - 8)}px`;
    } else {
      popup.style.top = `${Math.max(4, top)}px`;
    }
  }

  function render(suggestions, token) {
    options = suggestions;
    selected = 0;
    popup.innerHTML = '';
    if (!options.length) {
      close();
      return;
    }
    options.forEach((option, index) => {
      const item = document.createElement('div');
      item.className = 'editor-suggestion';
      item.id = `editorSuggestion-${index}`;
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', index === 0 ? 'true' : 'false');
      item.tabIndex = -1;

      const head = document.createElement('div');
      head.className = 'suggestion-head';
      const signature = document.createElement('code');
      signature.className = 'suggestion-signature';
      signature.textContent = option.signature || option.name;
      const returns = document.createElement('span');
      returns.className = 'suggestion-returns';
      returns.textContent = option.kind === 'template'
        ? 'template'
        : option.kind === 'variable'
          ? option.returns
          : option.kind === 'type'
            ? 'type'
            : option.kind === 'keyword'
              ? 'keyword'
              : option.returns;
      head.append(signature, returns);

      const description = document.createElement('span');
      description.className = 'suggestion-description';
      description.textContent = option.description;

      item.append(head, description);
      item.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        accept(option);
      });
      popup.appendChild(item);
    });
    popup.classList.remove('hidden');
    editor.setAttribute('aria-expanded', 'true');
    updateSelection();
    positionPopup();
    lastTrigger = token;
    notify();
  }

  function accept(option) {
    const { start, end } = range;
    const value = editor.value;
    let insert = option.insert || '';
    let caretOffset = option.caretOffset ?? insert.length;
    if (option.kind === 'template' && option.template) {
      const built = templateInsertion(option.template, value, start);
      insert = built.insert;
      caretOffset = built.caretOffset;
    }
    close();
    replace(start, end, insert);
    setCaret(start + caretOffset);
    suppressInputOnce();
  }

  function trigger() {
    if (!enabled || compositionActive) return;
    const value = editor.value;
    const start = editor.selectionStart;
    if (start !== editor.selectionEnd) {
      close();
      return;
    }
    const before = value.slice(0, start);
    const model = collectModel(value);

    if (before.endsWith('.')) {
      const receiverType = resolveReceiverType(before.slice(0, -1), model);
      range = { start, end: start };
      if (!receiverType) {
        close();
        return;
      }
      const suggestions = filterList(dedupe(memberSuggestions(receiverType, model)), '');
      render(suggestions, '');
      return;
    }

    const tokenMatch = before.match(/[A-Za-z_$][\w$]*$/);
    if (!tokenMatch || tokenMatch[0].length < 2) {
      close();
      return;
    }
    const token = tokenMatch[0];
    range = { start: start - token.length, end: start };
    const suggestions = filterList(dedupe(generalSuggestions(model)), token);
    render(suggestions, token);
  }

  function handleKeyDown(event) {
    if (event.isComposing || compositionActive) return false;
    const key = event.key;

    if (isVisible()) {
      if (key === 'ArrowDown' || key === 'ArrowUp') {
        event.preventDefault();
        const delta = key === 'ArrowDown' ? 1 : -1;
        selected = (selected + delta + options.length) % options.length;
        updateSelection();
        return true;
      }
      if (key === 'Enter' || key === 'Tab') {
        event.preventDefault();
        const option = options[selected];
        if (option) accept(option);
        return true;
      }
      if (key === 'Escape') {
        event.preventDefault();
        close();
        return true;
      }
      if (['ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(key)) {
        close();
      }
    }

    if (!enabled) return false;
    if (event.ctrlKey || event.metaKey || event.altKey) return false;

    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const value = editor.value;

    if (OPENERS[key]) {
      event.preventDefault();
      if (CLOSERS.has(key) && start === end && value[start] === key) {
        setCaret(start + 1);
        return true;
      }
      const selectedText = value.slice(start, end);
      const closer = OPENERS[key];
      if (selectedText) {
        replace(start, end, `${key}${selectedText}${closer}`);
        setCaret(start + 1 + selectedText.length + 1);
      } else {
        replace(start, end, `${key}${closer}`);
        setCaret(start + 1);
      }
      suppressInputOnce();
      return true;
    }

    if (CLOSERS.has(key) && start === end && value[start] === key) {
      event.preventDefault();
      setCaret(start + 1);
      return true;
    }

    if (key === 'Backspace' && start === end && start > 0) {
      const before = value[start - 1];
      const after = value[start];
      if (OPENERS[before] === after) {
        event.preventDefault();
        replace(start - 1, start + 1, '');
        setCaret(start - 1);
        suppressInputOnce();
        return true;
      }
    }

    if (key === 'Enter' && !event.shiftKey) {
      const lineStart = value.lastIndexOf('\n', start - 1) + 1;
      const lineIndent = (value.slice(lineStart, start).match(/^\s*/) || [''])[0];
      const previous = value[start - 1];
      if (previous === '{') {
        event.preventDefault();
        const inner = `${lineIndent}    `;
        if (value[start] === '}') {
          replace(start, end, `\n${inner}\n${lineIndent}`);
          setCaret(start + 1 + inner.length);
        } else {
          replace(start, end, `\n${inner}`);
          setCaret(start + 1 + inner.length);
        }
        suppressInputOnce();
        return true;
      }
      if (lineIndent && start === end) {
        event.preventDefault();
        replace(start, start, `\n${lineIndent}`);
        setCaret(start + 1 + lineIndent.length);
        suppressInputOnce();
        return true;
      }
    }

    return false;
  }

  function onInput(event) {
    if (suppressNextInput) {
      suppressNextInput = false;
      return;
    }
    if (event?.isComposing || compositionActive) {
      close();
      return;
    }
    if (typeof event?.inputType === 'string' && /^(insertFromPaste|insertFromDrop|deleteByCut)/.test(event.inputType)) {
      close();
      return;
    }
    trigger();
  }

  function setEnabled(next) {
    enabled = Boolean(next);
    editor.setAttribute('data-assist', enabled ? 'on' : 'off');
    if (!enabled) close();
    notify();
  }

  editor.setAttribute('aria-autocomplete', 'list');
  editor.setAttribute('aria-controls', popup.id || 'editorPopup');
  editor.setAttribute('aria-expanded', 'false');
  editor.setAttribute('data-assist', 'on');

  editor.addEventListener('input', onInput);
  editor.addEventListener('compositionstart', () => {
    compositionActive = true;
    close();
  });
  editor.addEventListener('compositionend', () => {
    compositionActive = false;
  });
  editor.addEventListener('scroll', () => {
    if (isVisible()) positionPopup();
  });
  editor.addEventListener('blur', () => {
    setTimeout(() => {
      if (document.activeElement === editor) return;
      if (popup.contains(document.activeElement)) return;
      close();
    }, 0);
  });
  document.addEventListener('pointerdown', (event) => {
    if (!isVisible()) return;
    if (event.target === editor || popup.contains(event.target)) return;
    close();
  });
  window.addEventListener('resize', () => {
    if (isVisible()) positionPopup();
  });

  return {
    handleKeyDown,
    trigger,
    close,
    setEnabled,
    isEnabled: () => enabled,
    isVisible,
    refresh: trigger,
    destroy() {
      close();
      editor.removeEventListener('input', onInput);
    },
  };
}
