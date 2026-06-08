/** Lightweight, dependency-free SQL syntax highlighter. Tokenizes into React
 *  spans (no dangerouslySetInnerHTML, so it is XSS-safe) and colours keywords,
 *  strings, and numbers. Purely presentational. */

const KEYWORDS = new Set([
  'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'NULL', 'AS', 'ON', 'JOIN', 'INNER', 'LEFT',
  'RIGHT', 'FULL', 'OUTER', 'CROSS', 'GROUP', 'BY', 'ORDER', 'HAVING', 'LIMIT', 'OFFSET', 'DESC',
  'ASC', 'DISTINCT', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
  'IN', 'IS', 'LIKE', 'BETWEEN', 'UNION', 'ALL', 'WITH', 'OVER', 'PARTITION', 'CAST', 'COALESCE',
  'EXTRACT', 'INTERVAL', 'CURRENT_DATE', 'CURRENT_TIMESTAMP', 'NOW', 'TRUE', 'FALSE',
]);

const TOKEN = /'[^']*'|"[^"]*"|[A-Za-z_][\w.]*|\d+(?:\.\d+)?|\s+|[^\s\w]/g;

const Sql = ({ code, className = '' }: { code: string; className?: string }) => {
  const tokens = code.match(TOKEN) ?? [code];
  return (
    <pre className={`${className} sql-hl`}>
      {tokens.map((t, i) => {
        if (/^['"]/.test(t)) return <span key={i} className="sql-str">{t}</span>;
        if (/^\d/.test(t)) return <span key={i} className="sql-num">{t}</span>;
        if (/^[A-Za-z_]+$/.test(t) && KEYWORDS.has(t.toUpperCase()))
          return <span key={i} className="sql-kw">{t}</span>;
        return <span key={i}>{t}</span>;
      })}
    </pre>
  );
};

export default Sql;
