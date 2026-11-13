// 卡牌索引层：数据本体在 cards.se01.js（由 tools/build-se01.mjs 从 SE01_卡表.md 生成）。
// 旧卡（se001—se053）保留别名，避免历史回放与脚本按旧 id 取卡时失配。
import { SE01_CARDS, SE01_SPIRITS } from './cards.se01.js';

export const CARD_DATA = SE01_CARDS;
export const SPIRIT_DATA = SE01_SPIRITS;

const LEGACY_IDS = {
  新人冒险者: 'se001', 冒险准备: 'se002', 黑市商人: 'se003', 混沌打击: 'se004', 混沌冲击: 'se005',
  荒原狼: 'se006', 岩石巨像: 'se007', 巨石守卫: 'se008', 山岭巨人: 'se009', 混沌聚合体: 'se010',
  火焰鸟: 'se011', 地狱犬: 'se012', 烈焰斗士: 'se013', 烈焰之力: 'se014', 烈焰聚合体: 'se015',
  火球术: 'se016', 烈焰战将: 'se017', 回复灵光: 'se018', 圣光打击: 'se019', 治愈灵光: 'se020',
  圣光肃清: 'se021', 圣光聚合体: 'se022', 光能守护者: 'se023', 圣光祷告者: 'se024', 圣光战将: 'se025',
  织梦学徒: 'se026', 迎宾入梦: 'se027', 梦境巡逻员: 'se028', 幻梦聚合体: 'se029', 梦质处理师: 'se030',
  噩梦降临: 'se031', 幻梦战将: 'se032', 梦境采集者: 'se033', 梦境采集: 'se034', 智慧之光: 'se035',
  奥术飞弹: 'se036', 命运的指引: 'se037', 预言学徒: 'se038', 水晶聚合体: 'se039', 分解射线: 'se040',
  法术反制: 'se041', 彩虹喷射: 'se042', 法师护甲: 'se043', 次元超越: 'se044', 自杀式袭击: 'se045',
  灵质榨取: 'se046', 暗夜战将: 'se047', 黑暗聚合体: 'se048', '亡魂役使者·伊可莱': 'se049',
  灵质重聚: 'se050', 自我献祭: 'se051', 蹒跚的僵尸: 'se052', 劣质回复药剂: 'se053',
};

export const BY_NAME = new Map(CARD_DATA.map((c) => [c.name, c]));
export const BY_ID = new Map(CARD_DATA.map((c) => [c.id, c]));
for (const [name, id] of Object.entries(LEGACY_IDS)) {
  const card = BY_NAME.get(name);
  if (card) BY_ID.set(id, card);
}
export const BY_SPIRIT = new Map(SPIRIT_DATA.map((s) => [s.name, s]));

export const COLORS = ['白', '黑', '绿', '红', '蓝', '黄', '紫', '灰'];
export const TYPES = ['灵像', '灵感', '灵性'];
export const RARITIES = ['微响', '叠响', '共鸣', '绝响'];
