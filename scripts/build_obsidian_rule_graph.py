#!/usr/bin/env python3
import csv
import json
import re
import shutil
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
KB_PATH = ROOT / "distillation/douyin-shooting-coach/outputs/knowledge_base.json"
CARDS_DIR = ROOT / "distillation/douyin-shooting-coach/outputs/cards"
TRANSCRIPTS_DIR = ROOT / "distillation/douyin-shooting-coach/outputs/transcripts"
OUT = ROOT / "obsidian/投篮规则知识图谱"


NODE_FAMILIES = {
    "问题": [
        {
            "name": "手快脚慢",
            "aliases": ["手快脚慢", "脚慢", "上肢先动", "先举手", "球先向上举"],
            "summary": "上肢起球或出手动作早于下肢蹬伸，导致下肢力量没有顺畅接入投篮。",
            "acceptance": "必须连接到起球/屈膝时序、上下肢脱节、下肢蹬伸链和同步训练。",
        },
        {
            "name": "重心前冲",
            "aliases": ["重心前冲", "前倾", "前跳", "身体前倾", "身体重心前移", "向前冲"],
            "summary": "出手阶段身体水平位移或躯干前倾过大，压低释放空间并破坏稳定性。",
            "acceptance": "必须连接到躯干前倾、核心抗前冲、释放点/出手角和误判边界。",
        },
        {
            "name": "释放点低",
            "aliases": ["释放点低", "出手点低", "出手高度低", "低出手点", "释放高度"],
            "summary": "出手高度或释放空间不足，常与伸展不足、前冲或上肢力线问题共同出现。",
            "acceptance": "必须连接到出手高度低、膝髋伸展不足、释放角/球路和低释放误判条件。",
        },
        {
            "name": "辅助手发力",
            "aliases": ["辅助手发力", "辅助手拇指", "辅助手参与", "非投篮手", "扶球手", "拇指发力"],
            "summary": "辅助手在出手阶段参与拨球或推球，干扰主手直线释放和球路稳定。",
            "acceptance": "必须连接到球路偏移、肘腕释放链、辅助手隔离训练和误判边界。",
        },
        {
            "name": "上下肢脱节",
            "aliases": ["上下肢脱节", "发力脱节", "发力不连贯", "分段发力", "力量传递中断", "甩狙"],
            "summary": "下肢、髋部、核心和上肢没有按稳定节奏传递力量。",
            "acceptance": "必须连接到手快脚慢、下肢蹬伸链、伸髋起球、上肢提前主导。",
        },
        {
            "name": "伸髋不足",
            "aliases": ["伸髋不足", "伸髋", "髋部力量不足", "伸宽", "臀部发力"],
            "summary": "髋部伸展没有带动起球，远投时容易用上肢代偿。",
            "acceptance": "必须连接到伸髋起球、臀大肌、核心稳定和伸髋训练。",
        },
        {
            "name": "肘腕力线不直",
            "aliases": ["手肘外翻", "手腕扭曲", "力线不直", "侧旋", "拨球", "手肘内收"],
            "summary": "投篮手肘、腕、手指释放方向不稳定，影响球路和旋转。",
            "acceptance": "必须连接到肘腕释放链、球路偏移、单手直线投篮。",
        },
        {
            "name": "起跳慢",
            "aliases": ["起跳慢", "下肢蹬伸变慢", "下肢爆发力不足", "深蹲过度", "过度蓄力"],
            "summary": "下肢压缩和反弹效率低，导致投篮节奏慢、力量传递断裂。",
            "acceptance": "必须连接到下肢蹬伸链、足踝压弹链、牵张反射和触地即弹训练。",
        },
        {
            "name": "球路侧偏",
            "aliases": ["球路偏移", "偏左", "偏右", "球路偏左", "球路偏右", "侧旋"],
            "summary": "篮球离开手后的水平方向或旋转异常，常由辅助手、肘腕力线或身体旋转导致。",
            "acceptance": "必须连接到辅助手发力、肘腕力线不直、球路偏左偏右和直线释放训练。",
        },
        {
            "name": "证据不足",
            "aliases": ["证据不足", "不可判断", "not_stated", "无法提取", "误判"],
            "summary": "视频内容、视角、帧率或规则证据不足，不能下强诊断。",
            "acceptance": "必须连接到误判边界和所有需要复核的规则。",
        },
    ],
    "信号": [
        {"name": "起球早于屈膝", "aliases": ["起球早于屈膝", "先举手", "球先向上举", "起球早", "ball_lift"], "summary": "球开始上升早于下肢启动或屈膝/伸展节奏。"},
        {"name": "躯干前倾过大", "aliases": ["躯干前倾", "身体前倾", "前倾角", "trunk_lean"], "summary": "出手或起跳阶段躯干前倾幅度过大。"},
        {"name": "膝髋伸展不足", "aliases": ["膝髋伸展不足", "屈膝屈髋", "膝关节", "髋关节", "伸展不足"], "summary": "最低点后膝髋打开不足或打开过慢。"},
        {"name": "球路偏左偏右", "aliases": ["球路偏左", "球路偏右", "球路偏移", "侧旋", "偏左", "偏右"], "summary": "球路水平偏移或旋转方向异常。"},
        {"name": "出手高度低", "aliases": ["出手高度低", "释放高度", "出手点低", "低出手点", "release_height"], "summary": "出手点相对身体或同类投篮样本偏低。"},
        {"name": "蹬地起球不同步", "aliases": ["蹬地与起球", "蹬地同时起球", "起球同步", "下肢与上肢同步"], "summary": "蹬地、伸髋、起球之间存在明显时差。"},
        {"name": "辅助手未及时分离", "aliases": ["辅助手未离开", "辅助手拇指", "扶球手", "辅助手参与"], "summary": "出手前后辅助手仍推动或拨动篮球。"},
        {"name": "手肘外翻", "aliases": ["手肘外翻", "肘部外展", "肘外翻"], "summary": "投篮手肘偏离稳定力线。"},
        {"name": "手腕侧拨或扭曲", "aliases": ["手腕扭曲", "侧拨", "无名指小拇指", "食指与中指"], "summary": "手腕和手指释放方向偏离目标线。"},
        {"name": "下肢压缩过深", "aliases": ["过度依赖下肢蓄力", "深度压缩", "屈膝幅度过大"], "summary": "下肢蓄力过深导致反弹慢、节奏拖沓。"},
        {"name": "核心稳定不足", "aliases": ["核心稳定", "核心不稳", "核心力量弱", "核心紧张"], "summary": "躯干不能稳定传导下肢力量或抗前冲。"},
    ],
    "发力链": [
        {"name": "下肢蹬伸链", "aliases": ["下肢蹬伸", "蹬地", "下肢力量", "脚踝", "膝盖", "髋部"], "summary": "脚踝、膝、髋从地面向上输出力量的链条。"},
        {"name": "伸髋起球", "aliases": ["伸髋起球", "伸髋", "臀部发力", "伸宽带动手"], "summary": "髋部伸展带动球上升，避免上肢先举球。"},
        {"name": "核心抗前冲", "aliases": ["核心抗前冲", "核心稳定", "重心前冲", "躯干前倾"], "summary": "核心稳定躯干和骨盆，减少出手阶段水平漂移。"},
        {"name": "上肢提前主导", "aliases": ["上肢主导", "手臂过度用力", "手臂先动", "上肢代偿"], "summary": "上肢过早接管发力，削弱下肢和核心传导。"},
        {"name": "肘腕释放链", "aliases": ["肘腕释放", "手肘", "手腕", "拨球", "手指"], "summary": "肩、肘、腕、手指完成末端直线释放的链条。"},
        {"name": "足踝压弹链", "aliases": ["压弹式", "前脚掌", "足部生物力学", "踝关节主动发力"], "summary": "以前脚掌和踝关节触发快速反弹，减少慢速深蹲蓄力。"},
        {"name": "筋膜弹性与牵张反射", "aliases": ["筋膜弹性", "牵张反射", "千张反射", "触地即弹"], "summary": "利用快速拉伸后的弹性反弹提高起跳和出手效率。"},
        {"name": "躯干旋转控制", "aliases": ["过度旋转", "身体旋转", "转体", "平衡发力"], "summary": "控制躯干和骨盆旋转，避免球路和释放方向受干扰。"},
    ],
    "肌群": [
        {"name": "臀大肌", "aliases": ["臀大肌", "臀部发力", "伸髋肌群"], "summary": "负责髋部伸展和下肢力量向上传导。"},
        {"name": "股四头肌", "aliases": ["股四头肌", "大腿", "伸膝", "膝关节伸展"], "summary": "负责伸膝与下肢蹬伸。"},
        {"name": "腓肠肌", "aliases": ["腓肠肌", "小腿", "踝关节", "前脚掌"], "summary": "负责踝跖屈和前脚掌快速蹬地。"},
        {"name": "核心稳定肌群", "aliases": ["核心稳定肌群", "核心力量", "腹直肌", "腹斜肌", "竖脊肌"], "summary": "维持躯干、骨盆和重心稳定。"},
        {"name": "三角肌前束", "aliases": ["三角肌前束", "肩部", "抬臂", "上肢发力"], "summary": "参与上肢抬球和末端发力，过度主导时可能造成代偿。"},
        {"name": "肱三头肌", "aliases": ["肱三头肌", "伸肘", "顶肘"], "summary": "参与伸肘和出手末端释放。"},
        {"name": "前臂屈伸肌群", "aliases": ["前臂", "腕屈伸", "手腕", "手指", "拨球"], "summary": "控制手腕、手指释放和球的旋转方向。"},
        {"name": "腘绳肌", "aliases": ["腘绳肌", "后链", "髋膝协同"], "summary": "参与髋膝协同和起跳制动。"},
        {"name": "髂腰肌", "aliases": ["髂腰肌", "屈髋肌群", "屈髋肌"], "summary": "屈髋紧张可能影响伸髋和骨盆控制。"},
        {"name": "肩胛稳定肌群", "aliases": ["肩胛", "背部肌群", "肩胛稳定"], "summary": "稳定肩胛与肩部释放路径。"},
    ],
    "训练": [
        {"name": "无球蹬地起球同步", "aliases": ["无球蹬地", "起球同步", "蹬地起球同步"], "summary": "无球或轻球练习下肢启动与起球同步。"},
        {"name": "伸髋带动起球", "aliases": ["伸髋带动起球", "伸宽带动手", "弹力带伸髋"], "summary": "用伸髋带动球上升，减少先举手。"},
        {"name": "单手直线投篮", "aliases": ["单手投篮", "单手直线", "罚球线单手"], "summary": "隔离投篮手，强化肘腕直线释放。"},
        {"name": "辅助手隔离训练", "aliases": ["辅助手隔离", "辅助手只扶球", "掌心出球", "辅助手不出球"], "summary": "弱化辅助手参与拨球或推球。"},
        {"name": "垫步触地即弹", "aliases": ["垫步", "触地即弹", "hop"], "summary": "利用垫步提前完成重心下降，提高触地反弹效率。"},
        {"name": "压弹式起跳训练", "aliases": ["压弹式", "前脚掌发力", "筋膜弹性"], "summary": "训练浅压缩和快速反弹，减少起跳慢。"},
        {"name": "近筐节奏投", "aliases": ["近距离", "近筐", "节奏投"], "summary": "近距离重复稳定下肢-起球-释放节奏。"},
        {"name": "低位到高位起球", "aliases": ["低位到高位", "起球路径", "贴近身体"], "summary": "训练球贴近身体中线顺势上升。"},
        {"name": "核心抗前冲定点投", "aliases": ["核心抗前冲", "定点投", "平衡落地"], "summary": "控制躯干和骨盆，减少出手后前冲。"},
    ],
}


MANUAL_EDGES = [
    ("起球早于屈膝", "提示", "手快脚慢"),
    ("手快脚慢", "属于", "上下肢脱节"),
    ("上下肢脱节", "破坏/断开", "下肢蹬伸链"),
    ("上下肢脱节", "依赖修复", "伸髋起球"),
    ("下肢蹬伸链", "相关肌群", "臀大肌"),
    ("下肢蹬伸链", "相关肌群", "股四头肌"),
    ("下肢蹬伸链", "相关肌群", "腓肠肌"),
    ("手快脚慢", "修正训练", "无球蹬地起球同步"),
    ("躯干前倾过大", "提示", "重心前冲"),
    ("重心前冲", "涉及", "核心抗前冲"),
    ("核心抗前冲", "相关肌群", "核心稳定肌群"),
    ("出手高度低", "提示", "释放点低"),
    ("膝髋伸展不足", "提示", "释放点低"),
    ("释放点低", "涉及", "下肢蹬伸链"),
    ("辅助手未及时分离", "提示", "辅助手发力"),
    ("辅助手发力", "可能导致", "球路侧偏"),
    ("辅助手发力", "修正训练", "辅助手隔离训练"),
    ("伸髋起球", "相关肌群", "臀大肌"),
    ("伸髋不足", "修正训练", "伸髋带动起球"),
    ("肘腕力线不直", "涉及", "肘腕释放链"),
    ("手肘外翻", "提示", "肘腕力线不直"),
    ("手腕侧拨或扭曲", "提示", "肘腕力线不直"),
    ("肘腕释放链", "相关肌群", "肱三头肌"),
    ("肘腕释放链", "相关肌群", "前臂屈伸肌群"),
    ("肘腕力线不直", "修正训练", "单手直线投篮"),
    ("起跳慢", "涉及", "足踝压弹链"),
    ("起跳慢", "涉及", "筋膜弹性与牵张反射"),
    ("起跳慢", "修正训练", "压弹式起跳训练"),
    ("下肢压缩过深", "提示", "起跳慢"),
    ("蹬地起球不同步", "提示", "上下肢脱节"),
    ("蹬地起球不同步", "提示", "手快脚慢"),
    ("核心稳定不足", "提示", "重心前冲"),
    ("球路偏左偏右", "提示", "球路侧偏"),
    ("球路侧偏", "涉及", "躯干旋转控制"),
    ("三角肌前束", "参与倾向", "上肢提前主导"),
    ("三角肌前束", "相关问题", "手快脚慢"),
    ("前臂屈伸肌群", "参与", "肘腕释放链"),
    ("前臂屈伸肌群", "相关问题", "球路侧偏"),
    ("前臂屈伸肌群", "修正训练", "单手直线投篮"),
]


CORE_CHAINS = {
    "手快脚慢": ["起球早于屈膝", "手快脚慢", "上下肢脱节", "下肢蹬伸链", "无球蹬地起球同步"],
    "重心前冲": ["躯干前倾过大", "重心前冲", "核心抗前冲", "核心稳定肌群", "核心抗前冲定点投"],
    "释放点低": ["出手高度低", "释放点低", "膝髋伸展不足", "下肢蹬伸链", "低位到高位起球"],
    "辅助手发力": ["辅助手未及时分离", "辅助手发力", "球路侧偏", "肘腕释放链", "辅助手隔离训练"],
    "上下肢脱节": ["起球早于屈膝", "上下肢脱节", "下肢蹬伸链", "伸髋起球", "无球蹬地起球同步"],
    "伸髋不足": ["膝髋伸展不足", "伸髋不足", "伸髋起球", "臀大肌", "伸髋带动起球"],
    "肘腕力线不直": ["手肘外翻", "肘腕力线不直", "肘腕释放链", "前臂屈伸肌群", "单手直线投篮"],
    "起跳慢": ["下肢压缩过深", "起跳慢", "足踝压弹链", "筋膜弹性与牵张反射", "压弹式起跳训练"],
    "球路侧偏": ["球路偏左偏右", "球路侧偏", "辅助手发力", "肘腕释放链", "单手直线投篮"],
    "证据不足": ["证据不足", "起球早于屈膝", "手快脚慢", "无球蹬地起球同步"],
}


NODE_EVIDENCE = {
    "起球早于屈膝": {
        "criteria": ["侧面 60fps 优先；观察起球开始帧与屈膝/伸髋启动帧的先后。", "需要至少 3 个连续关键帧能看到球、膝、髋。", "与同类型投篮和个人基线比较，不用单帧下结论。"],
        "false_positive": ["接球投的预备举球、后撤步、急停投可能自然改变起球节奏。", "视频丢帧或慢动作剪辑会扭曲时序。"],
    },
    "躯干前倾过大": {
        "criteria": ["侧面视角；重点看最低点到出手帧躯干相对垂直线的变化。", "应与髋部前移、释放高度、落地位置共同判断。"],
        "false_positive": ["后撤步、漂移投、对抗投篮可能需要自然前倾。", "45 度视角可能把身体旋转误投影成前倾。"],
    },
    "膝髋伸展不足": {
        "criteria": ["侧面视角；比较最低点、出手帧的膝角和髋角打开幅度。", "结合投篮距离、年龄、力量水平和是否一段式投篮。"],
        "false_positive": ["高水平一段式投篮可能屈伸幅度小但节奏高效。", "画面裁掉脚/髋时不能强判。"],
    },
    "球路偏左偏右": {
        "criteria": ["正面或篮筐方向视角；观察出手后初段球路和旋转。", "至少需要连续多球或清楚篮筐/目标线参照。"],
        "false_positive": ["单球偏移可能是瞄准波动，不一定是技术结构问题。", "拍摄角度偏斜会误导球路方向。"],
    },
    "出手高度低": {
        "criteria": ["侧面或正面视角；出手帧手腕/球相对头部、肩部和身高比例。", "必须区分远投、罚球、急停和防守压迫场景。"],
        "false_positive": ["低出手点可能是远投射程策略，不一定是错误。", "身高、臂展、出手速度会改变合理区间。"],
    },
    "蹬地起球不同步": {
        "criteria": ["侧面视角；比较蹬地/伸髋启动与球上升启动。", "以时序曲线或逐帧标注为准。"],
        "false_positive": ["垫步、跳步和接球节奏会改变同步关系。"],
    },
    "辅助手未及时分离": {
        "criteria": ["正面和侧面都最好；看出手前后辅助手手指是否继续接触/推动球。", "结合球路侧偏和球旋转判断。"],
        "false_positive": ["辅助手短暂分离延迟不等于发力。", "遮挡手指时只能标记复核。"],
    },
    "手肘外翻": {
        "criteria": ["正面视角；观察肩-肘-腕是否偏离主释放线。", "应和球路、手腕释放方向一起判断。"],
        "false_positive": ["个体侧身站位会改变肘部视觉位置。"],
    },
    "手腕侧拨或扭曲": {
        "criteria": ["正面近景优先；观察出手后手腕方向、手指指向和球旋转。", "需要清楚手部画面。"],
        "false_positive": ["低清、运动模糊下不应判断手指发力顺序。"],
    },
    "下肢压缩过深": {
        "criteria": ["侧面视角；看下蹲深度、最低点停顿和反弹速度。", "与投篮类型、距离、球员力量水平比较。"],
        "false_positive": ["两段式跳投和力量型球员可能需要更深压缩。"],
    },
    "核心稳定不足": {
        "criteria": ["观察躯干摆动、骨盆前移、落地稳定性。", "需要和重心前冲、旋转控制共同判断。"],
        "false_positive": ["不能从视频直接判断核心肌群激活强度。"],
    },
}


FORCE_CHAIN_EVIDENCE = {
    "下肢蹬伸链": ("脚踝、膝、髋在最低点后是否顺序打开，球是否被下肢上行力量带动。", "看不到脚、膝、髋或帧率过低时只做复核。"),
    "伸髋起球": ("髋部伸展是否与起球同步，是否出现先举球后伸髋。", "不能把臀部发力感直接当作视频可检测事实。"),
    "核心抗前冲": ("躯干前倾、髋部前移、落地前冲是否共同出现。", "单一前倾角不足以判断核心不足。"),
    "上肢提前主导": ("上肢起球、抬肘、伸肘明显早于下肢伸展。", "不能直接等同于肩臂肌肉过度激活。"),
    "肘腕释放链": ("肩-肘-腕-手指释放方向是否稳定，球路和旋转是否一致。", "手部不清晰时降级。"),
    "足踝压弹链": ("前脚掌触地、踝关节主动蹬伸、浅压缩反弹是否连贯。", "脚部被裁切时不可判断。"),
    "筋膜弹性与牵张反射": ("动作是否快速浅压缩并立刻反弹。", "视频只能推断弹性使用倾向，不能测量筋膜或神经反射。"),
    "躯干旋转控制": ("躯干/骨盆是否过度旋转并影响球路。", "45 度视角和镜头移动可能造成误判。"),
}


TRAINING_PURPOSE = {
    "无球蹬地起球同步": "建立下肢启动与起球同步，优先修复手快脚慢和上下肢脱节。",
    "伸髋带动起球": "让髋部伸展带动球上升，减少先举手和上肢提前主导。",
    "单手直线投篮": "隔离投篮手，强化肘腕释放链和球路直线性。",
    "辅助手隔离训练": "弱化辅助手拨球/推球，减少球路侧偏和主手释放干扰。",
    "垫步触地即弹": "训练移动接球时提前完成重心下降，触地后快速反弹。",
    "压弹式起跳训练": "减少深度慢蓄力，建立足踝压弹链和快速蹬伸。",
    "近筐节奏投": "在低压力距离下稳定下肢、起球、释放节奏。",
    "低位到高位起球": "训练球贴近身体中线自然上升，提高释放高度和节奏稳定。",
    "核心抗前冲定点投": "训练出手阶段躯干和骨盆稳定，减少重心前冲。",
}


def safe_name(name):
    return re.sub(r'[\\\\/:*?"<>|#^\\[\\]]+', "-", str(name)).strip()[:120] or "untitled"


def frontmatter(**kwargs):
    lines = ["---"]
    for key, value in kwargs.items():
        if isinstance(value, list):
            lines.append(f"{key}:")
            for item in value:
                lines.append(f"  - {json.dumps(str(item), ensure_ascii=False)}")
        else:
            lines.append(f"{key}: {json.dumps(value, ensure_ascii=False)}")
    lines.append("---")
    return "\n".join(lines) + "\n\n"


def link(name):
    return f"[[{name}]]"


def chain_line(items):
    return " -> ".join(link(item) for item in items)


def node_acceptance(node):
    return node.get("acceptance") or "需要能回链到证据、误判边界和修正动作。"


def node_criteria(node_name, family):
    if node_name in NODE_EVIDENCE:
        return NODE_EVIDENCE[node_name]["criteria"]
    if family == "发力链" and node_name in FORCE_CHAIN_EVIDENCE:
        observed, downgrade = FORCE_CHAIN_EVIDENCE[node_name]
        return [observed, downgrade]
    if family == "肌群":
        return [
            "只能由动作表现和发力链关系推断参与倾向。",
            "没有 EMG、力板、VBT 或专项测试时，不能确认该肌群的真实激活强度。",
        ]
    if family == "问题":
        return [
            "至少需要一个可观察信号和一个误判排除条件支持。",
            "优先使用多帧时序、同类投篮基线和规则卡证据，而不是单帧观感。",
        ]
    if family == "训练":
        return [
            "训练节点只能作为技术修正建议，不能作为医学康复处方。",
            "训练是否有效要通过下一次视频复测指标验证。",
        ]
    return ["需要回到视频视角、关键帧、指标和规则卡证据。"]


def node_false_positives(node_name, family):
    if node_name in NODE_EVIDENCE:
        return NODE_EVIDENCE[node_name]["false_positive"]
    if family == "发力链" and node_name in FORCE_CHAIN_EVIDENCE:
        return ["单一角度或单一信号不足以下强诊断。", "必须结合投篮类型、视角、帧率和个人基线。"]
    if family == "肌群":
        return ["视频看不到肌肉电活动，不能写成“某肌肉没有发力”。", "相关肌群只代表可能参与的力学环节，不代表力量薄弱或损伤。"]
    if family == "训练":
        return ["疼痛、伤病、术后或康复场景需要专业人员评估。", "训练建议只针对投篮技术，不替代体能或医疗诊断。"]
    return ["低清、遮挡、剪辑、非标准视角或样本太少时，应降级为复核。"]


def downgrade_rule(node_name, family):
    if family == "信号":
        return "缺少必要视角、关键帧、连续多帧证据或同类基线时，只能标记为候选信号。"
    if family == "发力链":
        return "发力链只能由多个信号共同支持；单一信号不足时降级为复核假设。"
    if family == "肌群":
        return "没有 EMG/力板/VBT/专项测试时，统一写作“可能相关肌群/参与倾向”。"
    if family == "训练":
        return "训练建议必须绑定可复测指标；没有复测指标时只作为练习方向。"
    return "证据不足时不下强诊断，只输出下一次补拍视角和复核指标。"


def card_text(card):
    fields = [
        card.get("title", ""),
        card.get("summary", ""),
        " ".join(card.get("tags") or []),
        " ".join(card.get("motion_focus") or []),
        " ".join(card.get("observable_signals") or []),
        " ".join(card.get("core_rules") or []),
        " ".join(card.get("false_positives") or []),
    ]
    for rule in card.get("diagnosis_rules") or []:
        fields.extend([str(rule.get(k, "")) for k in ("if", "then", "check", "repair", "confidence_basis")])
    for action in card.get("repair_actions") or []:
        fields.extend([str(action.get(k, "")) for k in ("drill", "purpose", "cue", "success_metric", "setup", "dosage")])
    return "\n".join(fields)


def match_nodes(text, family=None):
    text_l = text.lower()
    result = []
    families = [family] if family else NODE_FAMILIES.keys()
    for fam in families:
        for node in NODE_FAMILIES[fam]:
            if any(alias.lower() in text_l for alias in node["aliases"]):
                result.append(node["name"])
    return sorted(set(result))


def read_existing_card_md(card):
    rel = card.get("source_card_path")
    if not rel:
        return ""
    path = ROOT / "distillation/douyin-shooting-coach" / rel
    try:
        return path.read_text(encoding="utf-8")
    except Exception:
        return ""


def transcript_path_for(card_id):
    path = TRANSCRIPTS_DIR / f"{card_id}.txt"
    return path if path.exists() else None


def write(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def main():
    data = json.loads(KB_PATH.read_text(encoding="utf-8"))
    cards = data.get("cards", [])
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)

    all_nodes = {node["name"]: (fam, node) for fam, nodes in NODE_FAMILIES.items() for node in nodes}
    node_cards = defaultdict(list)
    card_nodes = {}
    edges = list(MANUAL_EDGES)

    for card in cards:
        text = card_text(card) + "\n" + read_existing_card_md(card)[:4000]
        matched = match_nodes(text)
        if not matched:
            matched = ["证据不足"]
        card_nodes[card["id"]] = matched
        for node_name in matched:
            node_cards[node_name].append(card)
            edges.append((card["id"], "关联节点", node_name))

        for a in matched:
            for b in matched:
                if a != b and all_nodes[a][0] != all_nodes[b][0]:
                    edges.append((a, "共现", b))

    # Source card notes.
    for card in cards:
        matched = card_nodes[card["id"]]
        transcript = transcript_path_for(card["id"])
        source_md = ROOT / "distillation/douyin-shooting-coach" / card.get("source_card_path", "")
        parts = [
            frontmatter(
                type="rule_card",
                source_id=card["id"],
                source_type=card.get("source_type", ""),
                source_url=card.get("source_url", ""),
                graph_nodes=matched,
            ),
            f"# {card.get('title', card['id'])}\n",
            "## 图谱节点\n",
            "\n".join(f"- {link(n)}" for n in matched),
            "\n\n## 摘要\n",
            card.get("summary", "not_stated"),
            "\n\n## 可观察信号\n",
            "\n".join(f"- {s}" for s in (card.get("observable_signals") or ["not_stated"])),
            "\n\n## IF/THEN 诊断规则\n",
        ]
        for rule in card.get("diagnosis_rules") or []:
            parts.append(f"- IF: {rule.get('if', 'not_stated')}\n  THEN: {rule.get('then', 'not_stated')}\n  CHECK: {rule.get('check', 'not_stated')}\n  REPAIR: {rule.get('repair', 'not_stated')}")
        parts.extend(["\n\n## 训练/修正动作\n"])
        for action in card.get("repair_actions") or []:
            parts.append(f"- {action.get('drill', 'not_stated')}: {action.get('purpose') or action.get('cue') or action.get('success_metric') or 'not_stated'}")
        parts.extend(["\n\n## 误判边界\n", "\n".join(f"- {x}" for x in (card.get("false_positives") or ["not_stated"]))])
        parts.extend([
            "\n\n## 术语降级声明\n",
            "- 原规则卡若出现“检测肌肉发力、肌肉张力、肌电、根治、诊断为”等强表述，在本图谱中统一降级为“视频动作线索提示/候选技术判断”。",
            "- 除非另有 EMG、力板、VBT 或专项测试，本图谱不能确认具体肌肉激活强度，也不提供医学诊断。",
        ])
        parts.extend(["\n\n## 来源\n", f"- 规则卡源文件: `{source_md}`"])
        if transcript:
            parts.append(f"\n- 完整转写文案: `{transcript}`")
        parts.append("\n\n## 证据纪律\n- 本卡只提供候选诊断，必须结合视频视角、帧率、姿态置信度和误判边界。\n")
        write(OUT / "规则卡" / f"{card['id']}.md", "\n".join(parts))

    # Node notes.
    family_index = defaultdict(list)
    for node_name, (family, node) in sorted(all_nodes.items(), key=lambda kv: (kv[1][0], kv[0])):
        cards_for_node = sorted(node_cards[node_name], key=lambda c: c.get("title", ""))
        family_index[family].append(node_name)
        inbound = sorted(set(src for src, rel, dst in edges if dst == node_name and src in all_nodes))
        outbound = sorted(set(dst for src, rel, dst in edges if src == node_name and dst in all_nodes))
        parts = [
            frontmatter(
                type="graph_node",
                family=family,
                aliases=node.get("aliases", []),
                acceptance=node_acceptance(node),
                source_card_count=len(cards_for_node),
            ),
            f"# {node_name}\n",
            f"## 定义\n{node.get('summary', '')}\n",
            "## 验收标准\n",
            f"- {node_acceptance(node)}\n",
        ]
        if node_name in CORE_CHAINS:
            parts.extend(["## 核心诊断链\n", f"- {chain_line(CORE_CHAINS[node_name])}\n"])
        if family == "训练":
            parts.extend(["## 训练目的\n", f"- {TRAINING_PURPOSE.get(node_name, node.get('summary', '用于技术复测和动作修正。'))}\n"])
        parts.extend([
            "## 可观察判据\n",
            *[f"- {item}" for item in node_criteria(node_name, family)],
            "\n## 专属误判边界\n",
            *[f"- {item}" for item in node_false_positives(node_name, family)],
            "\n## 降级条件\n",
            f"- {downgrade_rule(node_name, family)}\n",
            "## 关系\n",
        ])
        local_edges = [(s, r, d) for s, r, d in edges if s == node_name or d == node_name]
        if local_edges:
            def edge_sort_key(row):
                s, r, d = row
                is_card = s.startswith("douyin_") or d.startswith("douyin_")
                is_cooccur = r == "共现"
                return (is_card, is_cooccur, s, r, d)

            for s, r, d in sorted(set(local_edges), key=edge_sort_key):
                parts.append(f"- {link(s)} --{r}--> {link(d)}")
        else:
            parts.append("- 暂无显式关系，需要人工补强。")
        parts.extend(["\n## 相关规则卡\n"])
        for card in cards_for_node[:40]:
            parts.append(f"- [[{card['id']}]] - {card.get('title', '')}")
        if len(cards_for_node) > 40:
            parts.append(f"- 其余 {len(cards_for_node) - 40} 张见 `99 数据/node_index.json`。")
        parts.extend(["\n## 使用边界\n- 该节点是视频证据驱动的候选解释，不等同于直接测量肌肉激活。\n- 没有必要视角、关键帧或置信度时，应降级为复核建议。\n"])
        write(OUT / family / f"{safe_name(node_name)}.md", "\n".join(parts))

    # Index pages.
    home = [
        frontmatter(type="home", generated_from=str(KB_PATH)),
        "# 投篮规则知识图谱\n",
        "这是从现有规则卡、知识库和完整转写路径生成的 Obsidian vault。核心用途是把“动作问题 -> 可观察信号 -> 发力链 -> 相关肌群 -> 训练修正”连起来。\n",
        "## 快速入口\n",
    ]
    for family in ["问题", "信号", "发力链", "肌群", "训练"]:
        home.append(f"- [[{family}索引]]")
    home.extend([
        "- [[关系总览]]",
        "- [[验收清单]]",
        "- [[数据来源]]",
        "\n## 发力链推断流程\n信号 -> 问题 -> 发力链假设 -> 相关肌群参与倾向 -> 训练验证。\n",
        "\n## 证据纪律\n- 图谱输出的是发力链/肌肉参与推断，不是肌电检测。\n- 所有诊断必须回到规则卡、视频指标和误判边界。\n",
    ])
    write(OUT / "00 首页.md", "\n".join(home))

    for family, names in family_index.items():
        text = [frontmatter(type="family_index", family=family), f"# {family}索引\n"]
        for name in sorted(names):
            text.append(f"- {link(name)}")
        write(OUT / f"{family}索引.md", "\n".join(text))

    rels = Counter((r for _, r, _ in edges))
    overview = [
        frontmatter(type="overview"),
        "# 关系总览\n",
        "## 关系类型统计\n",
        *[f"- {rel}: {count}" for rel, count in rels.most_common()],
        "\n## 核心路径\n",
        "```mermaid",
        "graph TD",
        '  A["起球早于屈膝"] -->|提示| B["手快脚慢"]',
        '  B -->|属于| C["上下肢脱节"]',
        '  C -->|破坏/断开| D["下肢蹬伸链"]',
        '  C -->|依赖修复| Q["伸髋起球"]',
        '  D -->|相关肌群| E["臀大肌"]',
        '  D -->|相关肌群| F["股四头肌"]',
        '  D -->|相关肌群| G["腓肠肌"]',
        '  B -->|修正训练| H["无球蹬地起球同步"]',
        '  I["躯干前倾过大"] -->|提示| J["重心前冲"]',
        '  J -->|涉及| K["核心抗前冲"]',
        '  K -->|相关肌群| L["核心稳定肌群"]',
        '  M["辅助手未及时分离"] -->|提示| N["辅助手发力"]',
        '  N -->|可能导致| O["球路侧偏"]',
        '  N -->|修正训练| P["辅助手隔离训练"]',
        "```",
    ]
    write(OUT / "关系总览.md", "\n".join(overview))

    qa = [
        frontmatter(type="qa_checklist"),
        "# 验收清单\n",
        "每个节点族复核时至少检查：\n",
        "- 是否有定义、关系、相关规则卡、使用边界。\n",
        "- 是否能回链到规则卡或完整转写路径。\n",
        "- 是否避免把视频推断写成“肌肉直接检测”。\n",
        "- 是否覆盖用户指定的核心节点和关系。\n",
        "- 是否把误判边界保留下来。\n",
    ]
    write(OUT / "验收清单.md", "\n".join(qa))

    sources = [
        frontmatter(type="sources"),
        "# 数据来源\n",
        f"- 知识库 JSON: `{KB_PATH}`",
        f"- 规则卡目录: `{CARDS_DIR}`",
        f"- 完整转写文案目录: `{TRANSCRIPTS_DIR}`",
        f"- 规则卡数量: {len(cards)}",
        f"- 结构化 signal 数量: {len(data.get('signal_registry', {}).get('signals', []))}",
    ]
    write(OUT / "数据来源.md", "\n".join(sources))

    # Data exports.
    data_dir = OUT / "99 数据"
    data_dir.mkdir(parents=True, exist_ok=True)
    with (data_dir / "edges.csv").open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["source", "relation", "target"])
        for row in sorted(set(edges)):
            w.writerow(row)
    node_index = {
        name: {
            "family": all_nodes[name][0],
            "aliases": all_nodes[name][1].get("aliases", []),
            "source_cards": [c["id"] for c in node_cards[name]],
        }
        for name in sorted(all_nodes)
    }
    write(data_dir / "node_index.json", json.dumps(node_index, ensure_ascii=False, indent=2))
    write(data_dir / "graph.json", json.dumps({
        "nodes": [{"id": n, "family": fam} for n, (fam, _) in sorted(all_nodes.items())],
        "edges": [{"source": s, "relation": r, "target": d} for s, r, d in sorted(set(edges))],
    }, ensure_ascii=False, indent=2))

    summary = {
        "vault": str(OUT),
        "cards": len(cards),
        "node_count": len(all_nodes),
        "edge_count": len(set(edges)),
        "family_counts": {fam: len(names) for fam, names in family_index.items()},
        "cards_with_no_specific_match": sum(1 for nodes in card_nodes.values() if nodes == ["证据不足"]),
    }
    write(OUT / "99 数据/build_summary.json", json.dumps(summary, ensure_ascii=False, indent=2))
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
