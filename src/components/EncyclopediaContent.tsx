import type { ReactNode } from "react";
import type { Json } from "@/types/encyclopedia";

function record(value: Json): Record<string, Json> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}
function url(value: Json | undefined) {
  if (typeof value !== "string") return null;
  try {
    const parsed = new URL(value);
    return ["https:", "http:"].includes(parsed.protocol) ? parsed.href : null;
  } catch {
    return null;
  }
}
const labels: Record<string, string> = {
  name: "名称",
  description: "说明",
  title: "标题",
  date: "日期",
  details: "详细记录",
  platform: "平台",
  username: "用户",
  reviewer: "审稿人",
  content: "原文",
  rating: "评分",
  scale: "评分量表",
  url: "来源链接",
  source_url: "来源链接",
  note: "说明",
  supplier: "供应商",
  component: "零件",
  value: "值",
  unit: "单位",
  year: "年份",
  body: "内容",
  paragraphs: "内容",
  label: "项目",
  entity_id: "关联词条",
  end_date: "结束时间",
  published_date: "公布时间",
  state: "发生情况",
  status_after: "变更后状态",
  sources: "来源",
  related_papers: "关联论文",
  code_repositories: "关联代码",
  datasets: "关联数据集",
  relation: "关系类型",
  reason: "关联原因",
  version: "对应版本",
  author: "作者",
  affiliations: "署名机构",
  author_response: "作者回复",
  translation: "译文",
  original: "原文",
  language: "语言",
  model: "型号",
  system: "所属系统",
  suppliers: "供应商",
  start_date: "开始使用",
  timeline_id: "时间轴节点",
};

export function JsonContent({ value }: { value: Json }): ReactNode {
  if (value === null || value === "")
    return <span className="ep-muted">暂无资料</span>;
  if (Array.isArray(value))
    return value.length ? (
      <ul className="ep-json-list">
        {value.map(function item(child, index) {
          return (
            <li key={index}>
              <JsonContent value={child} />
            </li>
          );
        })}
      </ul>
    ) : (
      <span className="ep-muted">暂无资料</span>
    );
  if (typeof value === "object")
    return (
      <dl className="ep-json-object">
        {Object.entries(value).map(function item([key, child]) {
          return (
            <div key={key}>
              <dt>{labels[key] || key}</dt>
              <dd>
                {key === "entity_id" &&
                Number.isSafeInteger(child) &&
                Number(child) > 0 ? (
                  <a href={"/encyclopedia/entries/" + child}>
                    查看词条 #{String(child)}
                  </a>
                ) : (
                  <JsonContent value={child} />
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    );
  const link = url(value);
  return link ? (
    <a href={link} target="_blank" rel="noreferrer">
      {String(value)}
    </a>
  ) : (
    <span className="ep-json-text">
      {typeof value === "boolean" ? (value ? "是" : "否") : String(value)}
    </span>
  );
}
export function galleryImage(value: Json, id: number) {
  const image = record(value);
  if (typeof image.sha256 === "string" && /^[a-f0-9]{64}$/.test(image.sha256))
    return "/api/encyclopedia/entries/" + id + "/images/" + image.sha256;
  return url(typeof value === "string" ? value : image.url || image.src);
}
export function EntryGalleryCover({
  value,
  id,
  name,
}: {
  value: Json;
  id: number;
  name: string;
}) {
  const gallery = record(value);
  const src = galleryImage(gallery.cover || null, id);
  return src ? (
    <img className="ep-entry-cover" src={src} alt={name + "封面"} />
  ) : null;
}

export default function EncyclopediaContent({
  value,
  field,
  entityId,
}: {
  value: Json;
  field: string;
  entityId?: number;
}) {
  if (field === 'organization_category' && typeof value === 'string') {
    const names: Record<string,string> = {enterprise_research:'企业与科研机构',investment:'投资机构',public:'公共机构'};
    return <span>{names[value] || value}</span>;
  }
  if (field === 'is_highly_cited') return <span>{value===true?'高被引':value===false?'未达高被引标准':'尚未计算'}</span>;
  if (
    ["timeline", "investment_timeline"].includes(field) && Array.isArray(value) &&
    value.every(function event(item) { return "date" in record(item) && "title" in record(item); })
  ) {
    const events = value.map(record).sort(function chronological(a, b) {
      const left = typeof a.date === "string" ? a.date : "9999-99-99";
      const right = typeof b.date === "string" ? b.date : "9999-99-99";
      return left.localeCompare(right);
    });
    return (
      <ol className="ep-content-timeline">
        {events.map(function event(item, index) {
          const extra = Object.fromEntries(Object.entries(item).filter(function visible([key]) {
            return !["id", "date", "title", "description", "details", "kind"].includes(key);
          }));
          if (typeof extra.state === "string") extra.state = ({ planned: "计划", occurred: "已发生", unknown: "未确认" } as Record<string, string>)[extra.state] || extra.state;
          return (
            <li key={String(item.id || index)}>
              <time>{String(item.date || "日期未明确")}</time>
              <strong>{String(item.title || "时间记录")}</strong>
              {item.kind?<span data-event-kind={String(item.kind)}>{({founding:'成立',research:'研究',product:'产品',funding:'融资',investment:'投资',partnership:'合作',team:'团队',policy:'政策',award:'荣誉',restructuring:'重组',other:'其他',milestone:'里程碑',status:'状态变化',experiment:'实验',achievement:'成果',result:'结果',decommissioning:'退役'} as Record<string,string>)[String(item.kind)]||String(item.kind)}</span>:null}
              <JsonContent value={item.description || null} />
              {Object.keys(extra).length ? <JsonContent value={extra} /> : null}
              {item.details ? (
                <details>
                  <summary>详细记录</summary>
                  <JsonContent value={item.details} />
                </details>
              ) : null}
            </li>
          );
        })}
      </ol>
    );
  }
  if (field === "gallery" && entityId) {
    const gallery = record(value),
      images = Array.isArray(gallery.images) ? gallery.images : [];
    return (
      <div className="ep-content-gallery">
        {images.map(function image(item, index) {
          const data = record(item),
            src = galleryImage(item, entityId);
          return (
            <figure key={index}>
              {src ? (
                <img
                  src={src}
                  alt={String(data.alt_text || data.caption || "装置图片")}
                  loading="lazy"
                />
              ) : null}
              <figcaption>
                {String(data.caption || data.alt_text || "")}
              </figcaption>
            </figure>
          );
        })}
        {!images.length ? <p className="ep-muted">暂无图片</p> : null}
      </div>
    );
  }
  return <JsonContent value={value} />;
}
