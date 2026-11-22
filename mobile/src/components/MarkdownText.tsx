import React, { useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { colors, radii, spacing, typography } from "@/theme";
import { formatLatexExpression, isLikelyCurrencySpan } from "@/utils/markdownMath";

interface MarkdownTextProps {
  content: string;
  isStreaming?: boolean;
}

type InlineToken =
  | { type: "text"; value: string }
  | { type: "boldItalic"; value: string }
  | { type: "bold"; value: string }
  | { type: "italic"; value: string }
  | { type: "strike"; value: string }
  | { type: "code"; value: string }
  | { type: "math"; value: string }
  | { type: "link"; label: string; url: string };

/**
 * Strips stray unclosed trailing markdown markers (e.g. half-streamed `**` or `$`)
 * so live streaming text stays visually crisp.
 */
function sanitizeStreamingLine(line: string, isStreaming?: boolean): string {
  if (!isStreaming) return line;
  // Remove an incomplete trailing bold/italic marker while streaming
  return line.replace(/(\*{1,3}|_{2})$/, "");
}

function parseInlineTokens(line: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  // Order matters: code first, then links, inline math, boldItalic, bold, strike, italic
  const regex =
    /(`[^`\n]+?`|\[[^\]\n]+?\]\(https?:\/\/[^\s)]+\)|\\\([^)\n]+?\\\)|\$(?!\s)[^$\n]+?(?<!\s)\$|\*\*\*[^*\n]+?\*\*\*|\*\*[^*\n]+?\*\*|__[^_\n]+?__|~~[^~\n]+?~~|\*[^*\n]+?\*)/g;

  // Fallback-safe version without lookbehind for broad Hermes compatibility:
  const safeRegex =
    /(`[^`\n]+?`|\[[^\]\n]+?\]\(https?:\/\/[^\s)]+\)|\\\([^)\n]+?\\\)|\$[^$\n]+?\$|\*\*\*[^*\n]+?\*\*\*|\*\*[^*\n]+?\*\*|__[^_\n]+?__|~~[^~\n]+?~~|\*[^*\n]+?\*)/g;
  void regex;

  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = safeRegex.exec(line)) !== null) {
    const raw = match[0];
    const startIdx = match.index;

    // Validate `$...$` against currency & escaped `\$`
    if (raw.startsWith("$") && raw.endsWith("$")) {
      const prevChar = startIdx > 0 ? line[startIdx - 1] : "";
      const nextChar = line[startIdx + raw.length] || "";
      const inner = raw.slice(1, -1);
      if (prevChar === "\\" || isLikelyCurrencySpan(inner, nextChar)) {
        // Not math: advance past just the opening `$` so later `$...$` can still match
        if (startIdx + 1 > lastIdx) {
          tokens.push({ type: "text", value: line.slice(lastIdx, startIdx + 1) });
          lastIdx = startIdx + 1;
        }
        safeRegex.lastIndex = startIdx + 1;
        continue;
      }
    }

    if (startIdx > lastIdx) {
      tokens.push({ type: "text", value: line.slice(lastIdx, startIdx) });
    }

    if (raw.startsWith("`") && raw.endsWith("`")) {
      tokens.push({ type: "code", value: raw.slice(1, -1) });
    } else if (raw.startsWith("[") && raw.includes("](") && raw.endsWith(")")) {
      const sep = raw.indexOf("](");
      tokens.push({
        type: "link",
        label: raw.slice(1, sep),
        url: raw.slice(sep + 2, -1),
      });
    } else if (raw.startsWith("\\(") && raw.endsWith("\\)")) {
      tokens.push({ type: "math", value: formatLatexExpression(raw.slice(2, -2)) });
    } else if (raw.startsWith("$") && raw.endsWith("$")) {
      tokens.push({ type: "math", value: formatLatexExpression(raw.slice(1, -1)) });
    } else if (raw.startsWith("***") && raw.endsWith("***")) {
      tokens.push({ type: "boldItalic", value: raw.slice(3, -3) });
    } else if (
      (raw.startsWith("**") && raw.endsWith("**")) ||
      (raw.startsWith("__") && raw.endsWith("__"))
    ) {
      tokens.push({ type: "bold", value: raw.slice(2, -2) });
    } else if (raw.startsWith("~~") && raw.endsWith("~~")) {
      tokens.push({ type: "strike", value: raw.slice(2, -2) });
    } else if (raw.startsWith("*") && raw.endsWith("*")) {
      tokens.push({ type: "italic", value: raw.slice(1, -1) });
    } else {
      tokens.push({ type: "text", value: raw });
    }

    lastIdx = startIdx + raw.length;
  }

  if (lastIdx < line.length) {
    tokens.push({ type: "text", value: line.slice(lastIdx) });
  }

  return tokens;
}

function renderInline(line: string, keyPrefix: string, depth = 0): React.ReactNode {
  const tokens = parseInlineTokens(line);
  return tokens.map((tok, idx) => {
    const key = `${keyPrefix}-${idx}`;
    if (tok.type === "boldItalic") {
      return (
        <Text key={key} style={styles.boldItalic}>
          {depth < 2 ? renderInline(tok.value, `${key}-bi`, depth + 1) : tok.value}
        </Text>
      );
    }
    if (tok.type === "bold") {
      return (
        <Text key={key} style={styles.bold}>
          {depth < 2 ? renderInline(tok.value, `${key}-b`, depth + 1) : tok.value}
        </Text>
      );
    }
    if (tok.type === "italic") {
      return (
        <Text key={key} style={styles.italic}>
          {depth < 2 ? renderInline(tok.value, `${key}-i`, depth + 1) : tok.value}
        </Text>
      );
    }
    if (tok.type === "strike") {
      return (
        <Text key={key} style={styles.strike}>
          {tok.value}
        </Text>
      );
    }
    if (tok.type === "code") {
      return (
        <Text key={key} style={styles.inlineCode}>
          {` ${tok.value} `}
        </Text>
      );
    }
    if (tok.type === "math") {
      // Single variable (e.g. $i$-th) flows seamlessly as crisp italic math;
      // richer expressions get subtle bright math styling without clunky boxes.
      const isShortVar = /^[a-zA-Zα-ωΑ-Ω0-9ᵢⱼₖₙₘ₀-₉⁰-⁹]+$/.test(tok.value) && tok.value.length <= 3;
      return (
        <Text key={key} style={isShortVar ? styles.inlineMathVar : styles.inlineMathExpr}>
          {tok.value}
        </Text>
      );
    }
    if (tok.type === "link") {
      return (
        <Text
          key={key}
          style={styles.link}
          onPress={() => {
            if (/^https?:\/\//i.test(tok.url)) {
              void Linking.openURL(tok.url).catch(() => {});
            }
          }}
        >
          {tok.label}
        </Text>
      );
    }
    return <Text key={key}>{tok.value.replace(/\\\$/g, "$")}</Text>;
  });
}

function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await Clipboard.setStringAsync(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <View style={styles.codeBlock}>
      <View style={styles.codeHeader}>
        <View style={styles.codeLangWrap}>
          <Ionicons name="code-slash-outline" size={13} color={colors.cyan} />
          <Text style={styles.codeLang}>{(language || "code").toUpperCase()}</Text>
        </View>
        <Pressable onPress={() => void handleCopy()} style={styles.codeCopyBtn} hitSlop={8}>
          <Ionicons
            name={copied ? "checkmark" : "copy-outline"}
            size={13}
            color={copied ? colors.success : colors.textSecondary}
          />
          <Text style={[styles.codeCopyText, copied && styles.codeCopyTextDone]}>
            {copied ? "Copied" : "Copy"}
          </Text>
        </Pressable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.codeScrollContent}
      >
        <Text style={styles.codeBlockText} selectable>
          {code}
        </Text>
      </ScrollView>
    </View>
  );
}

function parseTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map(cell => cell.trim());
}

function isTableSeparator(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes("|") && !trimmed.includes("-")) return false;
  const cells = parseTableRow(trimmed);
  return cells.length >= 2 && cells.every(c => /^:?-{2,}:?$/.test(c));
}

function MarkdownTable({
  headers,
  rows,
  keyPrefix,
}: {
  headers: string[];
  rows: string[][];
  keyPrefix: string;
}) {
  const colCount = Math.max(headers.length, ...rows.map(r => r.length));
  const colWidths = Array.from({ length: colCount }, (_, cIdx) => {
    const maxChars = Math.max(
      (headers[cIdx] || "").length,
      ...rows.map(r => (r[cIdx] || "").length)
    );
    return Math.min(220, Math.max(88, maxChars * 7.5 + 24));
  });

  return (
    <View style={styles.tableOuter}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.tableInner}>
          <View style={[styles.tableRow, styles.tableHeaderRow]}>
            {Array.from({ length: colCount }, (_, cIdx) => (
              <View
                key={`${keyPrefix}-h-${cIdx}`}
                style={[styles.tableCell, { width: colWidths[cIdx] }]}
              >
                <Text style={styles.tableHeaderText} selectable>
                  {renderInline(headers[cIdx] || "", `${keyPrefix}-ht-${cIdx}`)}
                </Text>
              </View>
            ))}
          </View>
          {rows.map((row, rIdx) => (
            <View
              key={`${keyPrefix}-r-${rIdx}`}
              style={[styles.tableRow, rIdx % 2 === 1 && styles.tableRowAlt]}
            >
              {Array.from({ length: colCount }, (_, cIdx) => (
                <View
                  key={`${keyPrefix}-c-${rIdx}-${cIdx}`}
                  style={[styles.tableCell, { width: colWidths[cIdx] }]}
                >
                  <Text style={styles.tableCellText} selectable>
                    {renderInline(row[cIdx] || "", `${keyPrefix}-ct-${rIdx}-${cIdx}`)}
                  </Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

export function MarkdownText({ content, isStreaming }: MarkdownTextProps) {
  const lines = String(content || "").replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];

  let i = 0;
  let lastWasSpacer = false;

  while (i < lines.length) {
    const rawLine = lines[i] ?? "";
    const trimmed = rawLine.trim();
    const isLastLine = i === lines.length - 1;

    // 1. Fenced code blocks (```lang)
    if (trimmed.startsWith("```")) {
      const language = trimmed.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !(lines[i] ?? "").trim().startsWith("```")) {
        codeLines.push(lines[i] ?? "");
        i++;
      }
      if (i < lines.length) i++; // consume closing ```
      blocks.push(
        <CodeBlock key={`code-${i}`} language={language} code={codeLines.join("\n")} />
      );
      lastWasSpacer = false;
      continue;
    }

    // 2. Display math blocks: $$ ... $$ or \[ ... \]
    if (trimmed.startsWith("$$") || trimmed.startsWith("\\[")) {
      const isBracket = trimmed.startsWith("\\[");
      const openTok = isBracket ? "\\[" : "$$";
      const closeTok = isBracket ? "\\]" : "$$";

      // Single-line display math: $$ ... $$ or \[ ... \]
      if (trimmed.length > openTok.length + closeTok.length && trimmed.endsWith(closeTok)) {
        const expr = formatLatexExpression(
          trimmed.slice(openTok.length, trimmed.length - closeTok.length)
        );
        blocks.push(
          <View key={`math-${i}`} style={styles.mathBlock}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <Text style={styles.mathBlockText} selectable>
                {expr}
              </Text>
            </ScrollView>
          </View>
        );
        i++;
        lastWasSpacer = false;
        continue;
      }

      // Multi-line display math
      const mathLines: string[] = [];
      const firstRest = trimmed.slice(openTok.length).trim();
      if (firstRest) mathLines.push(firstRest);
      i++;
      while (i < lines.length) {
        const cur = (lines[i] ?? "").trim();
        if (cur.endsWith(closeTok)) {
          const beforeClose = cur.slice(0, cur.length - closeTok.length).trim();
          if (beforeClose) mathLines.push(beforeClose);
          i++;
          break;
        }
        mathLines.push(cur);
        i++;
      }
      const formatted = mathLines
        .map(l => formatLatexExpression(l))
        .filter(Boolean)
        .join("\n");
      if (formatted) {
        blocks.push(
          <View key={`math-ml-${i}`} style={styles.mathBlock}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <Text style={styles.mathBlockText} selectable>
                {formatted}
              </Text>
            </ScrollView>
          </View>
        );
        lastWasSpacer = false;
      }
      continue;
    }

    // 3. Blank lines (collapse repeated spacers cleanly)
    if (!trimmed) {
      if (blocks.length > 0 && !lastWasSpacer && i < lines.length - 1) {
        blocks.push(<View key={`sp-${i}`} style={styles.spacer} />);
        lastWasSpacer = true;
      }
      i++;
      continue;
    }

    lastWasSpacer = false;

    // 4. Markdown tables (header row + separator row + body rows)
    if (
      trimmed.includes("|") &&
      i + 1 < lines.length &&
      isTableSeparator(lines[i + 1] ?? "")
    ) {
      const headers = parseTableRow(trimmed);
      i += 2; // consume header + separator
      const rows: string[][] = [];
      while (i < lines.length) {
        const rowLine = (lines[i] ?? "").trim();
        if (!rowLine || !rowLine.includes("|")) break;
        rows.push(parseTableRow(rowLine));
        i++;
      }
      blocks.push(
        <MarkdownTable
          key={`tbl-${i}`}
          headers={headers}
          rows={rows}
          keyPrefix={`tbl-${i}`}
        />
      );
      continue;
    }

    // 5. Blockquotes (> ...)
    if (trimmed.startsWith(">")) {
      const quoteLines: string[] = [];
      while (i < lines.length && (lines[i] ?? "").trim().startsWith(">")) {
        quoteLines.push((lines[i] ?? "").trim().replace(/^>\s?/, ""));
        i++;
      }
      blocks.push(
        <View key={`bq-${i}`} style={styles.blockquote}>
          <View style={styles.blockquoteBar} />
          <View style={styles.blockquoteBody}>
            {quoteLines.map((qLine, qIdx) => (
              <Text key={`bql-${i}-${qIdx}`} style={styles.blockquoteText} selectable>
                {renderInline(qLine, `bqi-${i}-${qIdx}`)}
              </Text>
            ))}
          </View>
        </View>
      );
      continue;
    }

    // 6. Horizontal rules (---, ***, ___)
    if (/^([-*_]){3,}$/.test(trimmed)) {
      blocks.push(<View key={`hr-${i}`} style={styles.hr} />);
      i++;
      continue;
    }

    // 7. Headings (#, ##, ###, ####)
    const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1]?.length ?? 2;
      const titleText = sanitizeStreamingLine(headingMatch[2] ?? "", isStreaming && isLastLine);
      blocks.push(
        <View
          key={`h-${i}`}
          style={[
            styles.headingWrap,
            blocks.length > 0 && styles.headingTopSpace,
            level === 1 && styles.headingDivider,
          ]}
        >
          <Text
            style={[
              styles.heading,
              level === 1 && styles.headingLg,
              level >= 3 && styles.headingSm,
            ]}
            selectable
          >
            {renderInline(titleText, `hi-${i}`)}
          </Text>
        </View>
      );
      i++;
      continue;
    }

    // Leading indentation for nested lists (2 spaces = 1 level, max 3 levels)
    const leadingSpaces = rawLine.match(/^(\s*)/)?.[1]?.replace(/\t/g, "  ").length ?? 0;
    const indentLevel = Math.min(3, Math.floor(leadingSpaces / 2));
    const indentPx = indentLevel * 14;

    // 8. Checklist items (- [ ] or - [x])
    const checkMatch = trimmed.match(/^[-*]\s+\[([ xX])\]\s+(.+)$/);
    if (checkMatch) {
      const checked = (checkMatch[1] || "").toLowerCase() === "x";
      const itemText = sanitizeStreamingLine(checkMatch[2] || "", isStreaming && isLastLine);
      blocks.push(
        <View key={`chk-${i}`} style={[styles.listRow, { paddingLeft: 2 + indentPx }]}>
          <Ionicons
            name={checked ? "checkbox" : "square-outline"}
            size={16}
            color={checked ? colors.success : colors.primaryBright}
            style={styles.listIcon}
          />
          <Text style={[styles.listText, checked && styles.listTextChecked]} selectable>
            {renderInline(itemText, `ci-${i}`)}
          </Text>
        </View>
      );
      i++;
      continue;
    }

    // 9. Bullet list items (* item, - item, • item)
    const bulletMatch = trimmed.match(/^[-*•]\s+(.+)$/);
    if (bulletMatch) {
      const itemText = sanitizeStreamingLine(bulletMatch[1] || "", isStreaming && isLastLine);
      blocks.push(
        <View key={`bul-${i}`} style={[styles.listRow, { paddingLeft: 2 + indentPx }]}>
          <View
            style={[
              styles.bulletDot,
              indentLevel === 1 && styles.bulletRing,
              indentLevel >= 2 && styles.bulletDash,
            ]}
          />
          <Text style={styles.listText} selectable>
            {renderInline(itemText, `bi-${i}`)}
          </Text>
        </View>
      );
      i++;
      continue;
    }

    // 10. Numbered list items (1. item)
    const numMatch = trimmed.match(/^(\d+)[.)]\s+(.+)$/);
    if (numMatch) {
      const num = numMatch[1] || "1";
      const itemText = sanitizeStreamingLine(numMatch[2] || "", isStreaming && isLastLine);
      blocks.push(
        <View key={`num-${i}`} style={[styles.listRow, { paddingLeft: 2 + indentPx }]}>
          <View style={styles.numBadge}>
            <Text style={styles.numMarker}>{num}.</Text>
          </View>
          <Text style={styles.listText} selectable>
            {renderInline(itemText, `ni-${i}`)}
          </Text>
        </View>
      );
      i++;
      continue;
    }

    // 11. Standard paragraph line
    const cleanLine = sanitizeStreamingLine(trimmed, isStreaming && isLastLine);
    blocks.push(
      <Text key={`p-${i}`} style={styles.paragraph} selectable>
        {renderInline(cleanLine, `pi-${i}`)}
      </Text>
    );
    i++;
  }

  return <View style={styles.container}>{blocks}</View>;
}

const styles = StyleSheet.create({
  container: {
    gap: 6,
  },
  spacer: {
    height: 6,
  },
  headingWrap: {
    marginBottom: 2,
  },
  headingTopSpace: {
    marginTop: 8,
  },
  headingDivider: {
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(96, 165, 250, 0.22)",
    marginBottom: 4,
  },
  heading: {
    ...typography.heading,
    fontSize: 15.5,
    lineHeight: 22,
    fontWeight: "700",
    color: "#F8FAFC",
    letterSpacing: -0.2,
  },
  headingLg: {
    fontSize: 17,
    lineHeight: 24,
    color: "#FFFFFF",
  },
  headingSm: {
    fontSize: 14.5,
    lineHeight: 20,
    color: "#E2E8F0",
  },
  paragraph: {
    ...typography.body,
    fontSize: 14.5,
    lineHeight: 22.5,
    color: "#E2E8F0",
  },
  bold: {
    fontWeight: "700",
    color: "#FFFFFF",
  },
  boldItalic: {
    fontWeight: "700",
    fontStyle: "italic",
    color: "#FFFFFF",
  },
  italic: {
    fontStyle: "italic",
    color: "#CBD5E1",
  },
  strike: {
    textDecorationLine: "line-through",
    color: colors.textMuted,
  },
  inlineCode: {
    fontFamily: "monospace",
    fontSize: 12.5,
    color: "#7DD3FC",
    backgroundColor: "rgba(56, 189, 248, 0.14)",
    borderRadius: 5,
  },
  inlineMathVar: {
    fontStyle: "italic",
    fontWeight: "600",
    color: "#BAE6FD",
  },
  inlineMathExpr: {
    fontWeight: "600",
    color: "#BAE6FD",
  },
  link: {
    color: colors.cyan,
    textDecorationLine: "underline",
  },
  listRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.cyan,
    marginTop: 8.5,
    flexShrink: 0,
  },
  bulletRing: {
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderColor: colors.primaryBright,
  },
  bulletDash: {
    width: 7,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.textSecondary,
    marginTop: 10.5,
  },
  listIcon: {
    marginTop: 3.5,
    flexShrink: 0,
  },
  numBadge: {
    minWidth: 22,
    alignItems: "flex-end",
    marginTop: 1,
    flexShrink: 0,
  },
  numMarker: {
    ...typography.caption,
    fontSize: 13.5,
    lineHeight: 21,
    color: colors.cyan,
    fontWeight: "700",
  },
  listText: {
    flex: 1,
    ...typography.body,
    fontSize: 14.5,
    lineHeight: 22.5,
    color: "#E2E8F0",
  },
  listTextChecked: {
    color: colors.textSecondary,
  },
  blockquote: {
    flexDirection: "row",
    backgroundColor: "rgba(56, 189, 248, 0.08)",
    borderRadius: radii.sm,
    overflow: "hidden",
    marginVertical: 4,
  },
  blockquoteBar: {
    width: 3,
    backgroundColor: colors.cyan,
  },
  blockquoteBody: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    gap: 4,
  },
  blockquoteText: {
    ...typography.body,
    fontSize: 13.5,
    lineHeight: 21,
    color: "#CBD5E1",
    fontStyle: "italic",
  },
  mathBlock: {
    backgroundColor: "rgba(15, 23, 42, 0.85)",
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: "rgba(56, 189, 248, 0.25)",
    borderLeftWidth: 3,
    borderLeftColor: colors.cyan,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    marginVertical: 6,
  },
  mathBlockText: {
    fontFamily: "monospace",
    fontSize: 13.5,
    lineHeight: 22,
    color: "#E0F2FE",
    fontWeight: "600",
  },
  codeBlock: {
    backgroundColor: "#090D16",
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.22)",
    overflow: "hidden",
    marginVertical: 6,
  },
  codeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    backgroundColor: "rgba(30, 41, 59, 0.65)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(148, 163, 184, 0.14)",
  },
  codeLangWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  codeLang: {
    ...typography.label,
    fontSize: 10.5,
    color: colors.cyan,
    letterSpacing: 0.9,
  },
  codeCopyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.pill,
    backgroundColor: "rgba(148, 163, 184, 0.1)",
  },
  codeCopyText: {
    ...typography.caption,
    fontSize: 11,
    color: colors.textSecondary,
  },
  codeCopyTextDone: {
    color: colors.success,
  },
  codeScrollContent: {
    padding: spacing.md,
  },
  codeBlockText: {
    fontFamily: "monospace",
    fontSize: 12.5,
    lineHeight: 19,
    color: "#BAE6FD",
  },
  tableOuter: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.22)",
    backgroundColor: "#0C111C",
    overflow: "hidden",
    marginVertical: 6,
  },
  tableInner: {
    flexDirection: "column",
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(148, 163, 184, 0.12)",
  },
  tableHeaderRow: {
    backgroundColor: "rgba(59, 130, 246, 0.16)",
    borderBottomColor: "rgba(96, 165, 250, 0.3)",
  },
  tableRowAlt: {
    backgroundColor: "rgba(148, 163, 184, 0.04)",
  },
  tableCell: {
    paddingHorizontal: 11,
    paddingVertical: 9,
    justifyContent: "center",
  },
  tableHeaderText: {
    ...typography.label,
    fontSize: 12,
    lineHeight: 17,
    color: "#FFFFFF",
    fontWeight: "700",
    letterSpacing: 0.1,
  },
  tableCellText: {
    ...typography.body,
    fontSize: 13,
    lineHeight: 19,
    color: "#E2E8F0",
  },
  hr: {
    height: 1,
    backgroundColor: "rgba(148, 163, 184, 0.18)",
    marginVertical: 8,
  },
});
