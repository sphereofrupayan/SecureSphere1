/**
 * Converts LaTeX math expressions into clean, human-readable Unicode text
 * for mobile rendering without raw `$` or backslash syntax noise.
 */

const SUPERSCRIPT_MAP: Record<string, string> = {
  "0": "⁰",
  "1": "¹",
  "2": "²",
  "3": "³",
  "4": "⁴",
  "5": "⁵",
  "6": "⁶",
  "7": "⁷",
  "8": "⁸",
  "9": "⁹",
  "+": "⁺",
  "-": "⁻",
  "=": "⁼",
  "(": "⁽",
  ")": "⁾",
  n: "ⁿ",
  i: "ⁱ",
  x: "ˣ",
  y: "ʸ",
  k: "ᵏ",
  m: "ᵐ",
  t: "ᵗ",
  a: "ᵃ",
  b: "ᵇ",
  c: "ᶜ",
  d: "ᵈ",
  e: "ᵉ",
  r: "ʳ",
  s: "ˢ",
  p: "ᵖ",
};

const SUBSCRIPT_MAP: Record<string, string> = {
  "0": "₀",
  "1": "₁",
  "2": "₂",
  "3": "₃",
  "4": "₄",
  "5": "₅",
  "6": "₆",
  "7": "₇",
  "8": "₈",
  "9": "₉",
  "+": "₊",
  "-": "₋",
  "=": "₌",
  "(": "₍",
  ")": "₎",
  a: "ₐ",
  e: "ₑ",
  h: "ₕ",
  i: "ᵢ",
  j: "ⱼ",
  k: "ₖ",
  l: "ₗ",
  m: "ₘ",
  n: "ₙ",
  o: "ₒ",
  p: "ₚ",
  r: "ᵣ",
  s: "ₛ",
  t: "ₜ",
  u: "ᵤ",
  v: "ᵥ",
  x: "ₓ",
};

const LATEX_SYMBOLS: Array<[RegExp, string]> = [
  // Black-board bold sets
  [/\\mathbb\{R\}/g, "ℝ"],
  [/\\mathbb\{N\}/g, "ℕ"],
  [/\\mathbb\{Z\}/g, "ℤ"],
  [/\\mathbb\{Q\}/g, "ℚ"],
  [/\\mathbb\{C\}/g, "ℂ"],

  // Arrows & logic
  [/\\(?:Longleftrightarrow|Leftrightarrow|iff)(?![a-zA-Z])/g, "⇔"],
  [/\\(?:Longrightarrow|Rightarrow|implies)(?![a-zA-Z])/g, "⇒"],
  [/\\(?:Longleftarrow|Leftarrow)(?![a-zA-Z])/g, "⇐"],
  [/\\(?:longleftrightarrow|leftrightarrow)(?![a-zA-Z])/g, "↔"],
  [/\\(?:longrightarrow|rightarrow|to)(?![a-zA-Z])/g, "→"],
  [/\\(?:longleftarrow|leftarrow|gets)(?![a-zA-Z])/g, "←"],
  [/\\mapsto(?![a-zA-Z])/g, "↦"],
  [/\\forall(?![a-zA-Z])/g, "∀"],
  [/\\exists(?![a-zA-Z])/g, "∃"],
  [/\\(?:neg|lnot)(?![a-zA-Z])/g, "¬"],
  [/\\(?:land|wedge)(?![a-zA-Z])/g, "∧"],
  [/\\(?:lor|vee)(?![a-zA-Z])/g, "∨"],

  // Relations & operators
  [/\\(?:leq|le)(?![a-zA-Z])/g, "≤"],
  [/\\(?:geq|ge)(?![a-zA-Z])/g, "≥"],
  [/\\(?:neq|ne)(?![a-zA-Z])/g, "≠"],
  [/\\approx(?![a-zA-Z])/g, "≈"],
  [/\\equiv(?![a-zA-Z])/g, "≡"],
  [/\\sim(?![a-zA-Z])/g, "∼"],
  [/\\propto(?![a-zA-Z])/g, "∝"],
  [/\\times(?![a-zA-Z])/g, "×"],
  [/\\(?:cdot|ast)(?![a-zA-Z])/g, "·"],
  [/\\div(?![a-zA-Z])/g, "÷"],
  [/\\pm(?![a-zA-Z])/g, "±"],
  [/\\mp(?![a-zA-Z])/g, "∓"],
  [/\\oplus(?![a-zA-Z])/g, "⊕"],
  [/\\otimes(?![a-zA-Z])/g, "⊗"],
  [/\\circ(?![a-zA-Z])/g, "∘"],

  // Set theory
  [/\\notin(?![a-zA-Z])/g, "∉"],
  [/\\in(?![a-zA-Z])/g, "∈"],
  [/\\subseteq(?![a-zA-Z])/g, "⊆"],
  [/\\subset(?![a-zA-Z])/g, "⊂"],
  [/\\supseteq(?![a-zA-Z])/g, "⊇"],
  [/\\supset(?![a-zA-Z])/g, "⊃"],
  [/\\cup(?![a-zA-Z])/g, "∪"],
  [/\\cap(?![a-zA-Z])/g, "∩"],
  [/\\(?:emptyset|varnothing)(?![a-zA-Z])/g, "∅"],
  [/\\setminus(?![a-zA-Z])/g, "\\"],

  // Calculus & big ops
  [/\\infty(?![a-zA-Z])/g, "∞"],
  [/\\sum(?![a-zA-Z])/g, "∑"],
  [/\\prod(?![a-zA-Z])/g, "∏"],
  [/\\int(?![a-zA-Z])/g, "∫"],
  [/\\partial(?![a-zA-Z])/g, "∂"],
  [/\\nabla(?![a-zA-Z])/g, "∇"],
  [/\\(?:ldots|cdots|dots)(?![a-zA-Z])/g, "…"],
  [/\\vdots(?![a-zA-Z])/g, "⋮"],
  [/\\ddots(?![a-zA-Z])/g, "⋱"],

  // Brackets & delimiters
  [/\\lfloor(?![a-zA-Z])/g, "⌊"],
  [/\\rfloor(?![a-zA-Z])/g, "⌋"],
  [/\\lceil(?![a-zA-Z])/g, "⌈"],
  [/\\rceil(?![a-zA-Z])/g, "⌉"],
  [/\\langle(?![a-zA-Z])/g, "⟨"],
  [/\\rangle(?![a-zA-Z])/g, "⟩"],
  [/\\\|/g, "‖"],

  // Named functions
  [/\\(log|ln|sin|cos|tan|cot|sec|csc|max|min|lim|sup|inf|det|gcd|lcm|deg|exp|mod|arg|dim|ker)(?![a-zA-Z])/g, "$1"],
  [/\\(?:bmod|pmod)(?![a-zA-Z])/g, "mod"],

  // Greek letters (lowercase)
  [/\\alpha(?![a-zA-Z])/g, "α"],
  [/\\beta(?![a-zA-Z])/g, "β"],
  [/\\gamma(?![a-zA-Z])/g, "γ"],
  [/\\delta(?![a-zA-Z])/g, "δ"],
  [/\\(?:varepsilon|epsilon)(?![a-zA-Z])/g, "ε"],
  [/\\zeta(?![a-zA-Z])/g, "ζ"],
  [/\\eta(?![a-zA-Z])/g, "η"],
  [/\\(?:vartheta|theta)(?![a-zA-Z])/g, "θ"],
  [/\\iota(?![a-zA-Z])/g, "ι"],
  [/\\kappa(?![a-zA-Z])/g, "κ"],
  [/\\lambda(?![a-zA-Z])/g, "λ"],
  [/\\mu(?![a-zA-Z])/g, "μ"],
  [/\\nu(?![a-zA-Z])/g, "ν"],
  [/\\xi(?![a-zA-Z])/g, "ξ"],
  [/\\pi(?![a-zA-Z])/g, "π"],
  [/\\rho(?![a-zA-Z])/g, "ρ"],
  [/\\sigma(?![a-zA-Z])/g, "σ"],
  [/\\tau(?![a-zA-Z])/g, "τ"],
  [/\\upsilon(?![a-zA-Z])/g, "υ"],
  [/\\(?:varphi|phi)(?![a-zA-Z])/g, "φ"],
  [/\\chi(?![a-zA-Z])/g, "χ"],
  [/\\psi(?![a-zA-Z])/g, "ψ"],
  [/\\omega(?![a-zA-Z])/g, "ω"],

  // Greek letters (uppercase)
  [/\\Gamma(?![a-zA-Z])/g, "Γ"],
  [/\\Delta(?![a-zA-Z])/g, "Δ"],
  [/\\Theta(?![a-zA-Z])/g, "Θ"],
  [/\\Lambda(?![a-zA-Z])/g, "Λ"],
  [/\\Xi(?![a-zA-Z])/g, "Ξ"],
  [/\\Pi(?![a-zA-Z])/g, "Π"],
  [/\\Sigma(?![a-zA-Z])/g, "Σ"],
  [/\\Phi(?![a-zA-Z])/g, "Φ"],
  [/\\Psi(?![a-zA-Z])/g, "Ψ"],
  [/\\Omega(?![a-zA-Z])/g, "Ω"],
];

function extractBracedGroup(src: string, startIdx: number): { content: string; endIdx: number } | null {
  let pos = startIdx;
  while (pos < src.length && src[pos] === " ") pos++;
  if (src[pos] !== "{") return null;
  let depth = 0;
  for (let i = pos; i < src.length; i++) {
    if (src[i] === "\\" && i + 1 < src.length) {
      i++;
      continue;
    }
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) {
        return { content: src.slice(pos + 1, i), endIdx: i + 1 };
      }
    }
  }
  return null;
}

function replaceTwoArgCommand(
  input: string,
  commandPattern: RegExp,
  formatter: (a: string, b: string) => string
): string {
  let out = input;
  let safety = 0;
  while (safety < 20) {
    safety++;
    commandPattern.lastIndex = 0;
    const match = commandPattern.exec(out);
    if (!match) break;
    const afterCmd = match.index + match[0].length;
    const g1 = extractBracedGroup(out, afterCmd);
    if (!g1) break;
    const g2 = extractBracedGroup(out, g1.endIdx);
    if (!g2) break;
    const replacement = formatter(g1.content.trim(), g2.content.trim());
    out = out.slice(0, match.index) + replacement + out.slice(g2.endIdx);
  }
  return out;
}

function replaceOneArgCommand(
  input: string,
  commandPattern: RegExp,
  formatter: (a: string) => string
): string {
  let out = input;
  let safety = 0;
  while (safety < 30) {
    safety++;
    commandPattern.lastIndex = 0;
    const match = commandPattern.exec(out);
    if (!match) break;
    const afterCmd = match.index + match[0].length;
    const g1 = extractBracedGroup(out, afterCmd);
    if (!g1) break;
    const replacement = formatter(g1.content);
    out = out.slice(0, match.index) + replacement + out.slice(g1.endIdx);
  }
  return out;
}

function toScript(text: string, map: Record<string, string>): string | null {
  if (!text) return null;
  let result = "";
  for (const ch of text) {
    if (ch === " ") continue;
    const mapped = map[ch];
    if (!mapped) return null;
    result += mapped;
  }
  return result;
}

/**
 * Converts a raw LaTeX expression (without surrounding $ or \[ \]) into crisp Unicode.
 */
export function formatLatexExpression(rawExpr: string): string {
  let expr = String(rawExpr || "").trim();
  if (!expr) return "";

  // Strip sizing & spacing macros
  expr = expr
    .replace(/\\(left|right|big|Big|bigg|Bigg|displaystyle|textstyle|limits)\b/g, "")
    .replace(/\\(quad|qquad)\b/g, " ")
    .replace(/\\[,;:!]/g, " ");

  // Unwrap \text{...}, \mathbf{...}, \mathrm{...}, etc.
  expr = replaceOneArgCommand(
    expr,
    /\\(?:text|textbf|textit|textrm|mathrm|mathbf|mathit|mathcal|mathsf|mathtt|operatorname|overline|hat|tilde|vec|bar)/g,
    inner => inner
  );

  // Fractions: \frac{a}{b}, \dfrac{a}{b}, \tfrac{a}{b}
  expr = replaceTwoArgCommand(expr, /\\(?:d|t)?frac\b/g, (num, den) => {
    const cleanNum = formatLatexExpression(num);
    const cleanDen = formatLatexExpression(den);
    const wrapNum = /[+\-\s]/.test(cleanNum) && !/^\([^()]+\)$/.test(cleanNum) ? `(${cleanNum})` : cleanNum;
    const wrapDen = /[+\-\s]/.test(cleanDen) && !/^\([^()]+\)$/.test(cleanDen) ? `(${cleanDen})` : cleanDen;
    return `${wrapNum} / ${wrapDen}`;
  });

  // Binomials: \binom{n}{k}
  expr = replaceTwoArgCommand(expr, /\\(?:d|t)?binom\b/g, (n, k) => {
    return `C(${formatLatexExpression(n)}, ${formatLatexExpression(k)})`;
  });

  // Square roots: \sqrt[n]{x} and \sqrt{x}
  expr = expr.replace(/\\sqrt\[([^\]]+)\]\{([^}]+)\}/g, (_, deg: string, inner: string) => {
    const sup = toScript(deg.trim(), SUPERSCRIPT_MAP) || deg.trim();
    const cleaned = formatLatexExpression(inner);
    return `${sup}√(${cleaned})`;
  });
  expr = replaceOneArgCommand(expr, /\\sqrt\b/g, inner => {
    const cleaned = formatLatexExpression(inner.trim());
    return cleaned.length <= 2 ? `√${cleaned}` : `√(${cleaned})`;
  });

  // Replace known LaTeX symbols & Greek letters
  for (const [pattern, replacement] of LATEX_SYMBOLS) {
    expr = expr.replace(pattern, replacement);
  }

  // Escaped characters
  expr = expr
    .replace(/\\\{/g, "{")
    .replace(/\\\}/g, "}")
    .replace(/\\([%&#$_])/g, "$1")
    .replace(/\\\\/g, "\n");

  // Superscripts: ^{...} and ^x
  expr = expr.replace(/\^\{([^{}]+)\}/g, (_, inner: string) => {
    const mapped = toScript(inner.trim(), SUPERSCRIPT_MAP);
    return mapped ?? `^(${inner.trim()})`;
  });
  expr = expr.replace(/\^([0-9a-zA-Z])/g, (_, ch: string) => {
    return SUPERSCRIPT_MAP[ch] ?? `^${ch}`;
  });

  // Subscripts: _{...} and _x
  expr = expr.replace(/_\{([^{}]+)\}/g, (_, inner: string) => {
    const trimmed = inner.trim();
    const mapped = toScript(trimmed, SUBSCRIPT_MAP);
    if (mapped) return mapped;
    return `_${trimmed.includes(" ") || trimmed.includes(",") ? `(${trimmed})` : trimmed}`;
  });
  expr = expr.replace(/_([0-9a-zA-Z])/g, (_, ch: string) => {
    return SUBSCRIPT_MAP[ch] ?? `_${ch}`;
  });

  // Remove any remaining bare grouping braces around simple tokens
  expr = expr.replace(/\{([^{}]+)\}/g, "$1");

  // Remove any leftover unrecognized backslash before letters (e.g. \foo -> foo)
  expr = expr.replace(/\\([a-zA-Z]+)/g, "$1");

  // Tidy whitespace around punctuation
  expr = expr
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .trim();

  return expr;
}

/**
 * Checks whether a matched `$...$` body looks like currency (e.g. "$50 to $100")
 * rather than a LaTeX math expression.
 */
export function isLikelyCurrencySpan(inner: string, charAfterClose: string): boolean {
  if (!inner) return true;
  if (/^\s|\s$/.test(inner)) return true;
  // e.g. "$50-$100" or "$5,$10" where closing $ is immediately followed by a digit
  if (/^\d/.test(inner) && /^\d/.test(charAfterClose)) return true;
  return false;
}

/**
 * Converts markdown + inline/display LaTeX into clean, readable plain text for clipboard copy.
 */
export function cleanMarkdownForCopy(content: string): string {
  const lines = String(content || "").replace(/\r\n/g, "\n").split("\n");
  let inCode = false;

  const processed = lines.map(line => {
    if (line.trim().startsWith("```")) {
      inCode = !inCode;
      return line;
    }
    if (inCode) return line;

    // Preserve inline code spans while cleaning LaTeX outside them
    const parts = line.split(/(`[^`]+`)/g);
    return parts
      .map(part => {
        if (part.startsWith("`") && part.endsWith("`")) return part;
        let out = part;
        out = out.replace(/\$\$([^$]+?)\$\$/g, (_, m: string) => formatLatexExpression(m));
        out = out.replace(/\\\[([^\]]+?)\\\]/g, (_, m: string) => formatLatexExpression(m));
        out = out.replace(/\\\(([^)]+?)\\\)/g, (_, m: string) => formatLatexExpression(m));
        out = out.replace(/(\\)?\$([^$\n]+?)\$/g, (full, esc: string | undefined, m: string, offset: number, src: string) => {
          if (esc) return full;
          const after = src[offset + full.length] || "";
          if (isLikelyCurrencySpan(m, after)) return full;
          return formatLatexExpression(m);
        });
        return out;
      })
      .join("");
  });

  return processed.join("\n").trim();
}
