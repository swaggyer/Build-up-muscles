(function (global) {
  'use strict';

  const DAY_MS = 86400000;
  const MAX_EXTRA_MINUTES = 5;
  const MISSED_MINUTES = 30;
  const round = (value, digits = 0) => Number(value.toFixed(digits));
  const CARDIO_OPTIONS = Object.freeze(['walking', 'running', 'incline', 'stairs', 'swimming']);
  const CARDIO_NAMES = Object.freeze({ walking: '快走', running: '跑步', incline: '爬坡', stairs: '爬楼梯', swimming: '游泳' });
  const REP_TARGET_NOTE = '每组以 10 次起为目标；可降低难度，动作走样时结束，不强凑次数。';
  const trainingSources = Object.freeze([
    { title: 'CDC · 成人身体活动建议', url: 'https://www.cdc.gov/physical-activity-basics/guidelines/adults.html', note: '逐步争取每周 150 分钟中等强度有氧，以及至少 2 天肌力活动；少量活动也有价值。' },
    { title: 'NHS · 力量训练组数与次数（专业依据）', url: 'https://www.nhs.uk/live-well/exercise/how-to-improve-strength-flexibility/', note: '一般肌力练习建议每组 8–12 次、至少 2 组，可按能力增加到 3 组。本产品选择 10–12 次作为目标，不代表人人必须完成 10 次。' },
    { title: 'ACE · 训练变量与经验分级（专业依据）', url: 'https://www.acefitness.org/continuing-education/certified/may-2024/8632/the-ace-workout-builder-for-split-routines/', note: '组数、次数与组间休息需结合训练目标、经验和强度。本产品以 2–3 组、60–120 秒为起始参考，恢复不足可延长至 2–3 分钟。' },
    { title: '昆士兰州健康机构 · 高抬腿（专业依据）', url: 'https://hw.qld.gov.au/physical-activity/high-knees/', note: '高抬腿可按每侧 10–15 次练习。本产品从慢速踏步、每侧 10–12 次起步，按舒适高度抬膝。' },
    { title: 'NASM · 深蹲跳与落地控制（专业依据）', url: 'https://www.nasm.org/resource-center/exercise-library/squat-jump', note: '最大爆发力训练采用每组 5–8 次并充分恢复，疲劳会损害落地控制。本产品的 10 次是小幅协调目标，需已有基础；不追跳高，落地不稳就改普通深蹲或结束。' },
    { title: 'ATHLEAN-X · 俯卧撑动作教程（博主官方辅助）', url: 'https://learn.athleanx.com/articles/how-to-do-pushups', note: '辅助理解中立头颈、动作控制与难度调整；以标准完成 10 次为目标，能力不足先改跪姿等简化版本。博主教程不替代个人评估。' },
    { title: 'CDC · 用说话测试判断强度', url: 'https://www.cdc.gov/physical-activity-basics/measuring/index.html', note: '中等强度通常能说话但难以唱歌；恢复日应能轻松完整对话。' },
    { title: 'AHA · 热身与整理活动', url: 'https://www.heart.org/en/healthy-living/exercise-and-physical-activity/fitness-basics/warm-up-cool-down', note: '运动前后各预留 5 分钟逐渐加速与减速，按需要延长。' }
  ].map(Object.freeze));
  const planningNotes = Object.freeze([
    '这是面向一般健康成人的起步模板。组数、次数和休息是便于执行的初始安排，不代表对个人能力的测量；可减少一组或延长休息。',
    REP_TARGET_NOTE,
    '新手从 2 组 × 10 次的较易版本起步，有基础者按动作安排 2–3 组 × 10–12 次；单侧动作左右分别达到标示目标才算一组。',
    '平板支撑、侧平板与靠墙深蹲按秒保持，不把秒数换成次数；起步参考 20–30 秒，侧平板左右分别保持，姿势不稳可提前结束。',
    '组间通常休息 60–120 秒，俯卧撑、弓步与跳跃留出更长恢复；呼吸或动作尚未恢复时可延长至 2–3 分钟。',
    '深蹲跳为小幅协调练习，2 组 × 10 次、组间休息 120 秒，仅有基础且主动选择跳跃时加入。不追最大跳高，每次落地稳住；无法保持质量就改普通深蹲 10 次或提前结束。',
    '连续运动日穿插轻松有氧，力量训练至少隔一个日历日。每组保留约 2–3 次余力，先保证动作稳定。',
    '“全身燃脂”“下肢塑型”表示训练侧重点，不承诺某部位减脂或某日形成特定身材。',
    '自选练休周期可能低于每周活动建议；适应后在可恢复的范围内逐步积累，不用一次补齐。',
    '当前动作库以腿、胸、肩与核心为主，长期均衡训练还需要背部拉类练习，可请合格教练补充。'
  ]);

  function parseDay(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(0);
    date.setFullYear(year, month - 1, day);
    date.setHours(12, 0, 0, 0);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    return { year, month, day, date, stamp: Date.UTC(year, month - 1, day) };
  }

  function isoDayFromStamp(stamp) {
    const date = new Date(stamp);
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
  }

  function cycleConfig(profile) {
    const trainDays = Number(profile.trainDays);
    const restDays = Number(profile.restDays);
    if (!Number.isInteger(trainDays) || trainDays < 1 || trainDays > 4 ||
        !Number.isInteger(restDays) || restDays < 1 || restDays > 3) {
      throw new RangeError('请选择运动 1–4 天、休息 1–3 天的练休周期。');
    }
    return { trainDays, restDays, length: trainDays + restDays };
  }

  function estimate(profile = {}) {
    const height = Number(profile.height);
    const weight = Number(profile.weight);
    const age = Number(profile.age);
    const suppliedBodyFat = profile.bodyFat !== null && profile.bodyFat !== undefined && profile.bodyFat !== '';
    const result = {
      bmi: null, bodyFat: null, estimatedBodyFat: !suppliedBodyFat,
      bmr: null, tdee: null, calories: null, protein: null, carbs: null, fat: null,
      eligible: false, reason: '', warnings: []
    };
    if (!Number.isFinite(height) || height < 100 || height > 230 ||
        !Number.isFinite(weight) || weight < 30 || weight > 250 ||
        !Number.isFinite(age)) {
      result.reason = '请检查身高、体重和年龄；超出常规范围的情况建议由专业人员评估。';
      return result;
    }
    result.bmi = round(weight / ((height / 100) ** 2), 1);
    if (profile.sex !== 'male' && profile.sex !== 'female') {
      result.reason = '请为能量估算选择公式所用的生理性别；特殊情况建议向专业人员咨询。';
      return result;
    }
    if (suppliedBodyFat && (!Number.isFinite(Number(profile.bodyFat)) || Number(profile.bodyFat) < 3 || Number(profile.bodyFat) > 60)) {
      result.reason = '体脂率请输入 3–60% 之间的数值，或留空使用粗估。';
      return result;
    }
    const rawBMI = weight / ((height / 100) ** 2);
    result.bodyFat = suppliedBodyFat ? round(Number(profile.bodyFat), 1) : round(1.2 * rawBMI + 0.23 * age - (profile.sex === 'male' ? 10.8 : 0) - 5.4, 1);
    if (!suppliedBodyFat) {
      result.warnings.push('体脂为基于 BMI、年龄和性别的粗估；原研究标准估计误差约 4.1 个百分点，个体误差可能更大，不能替代测量。');
    }
    if (age < 18 || age > 64) {
      result.reason = '此基础原型仅适用于 18–64 岁成年人；请向医生或合格教练获取适龄计划。';
      return result;
    }
    if (rawBMI < 18.5 || rawBMI >= 35) {
      result.reason = '当前 BMI 超出本原型的基础计划适用范围；建议先由医生或营养师评估。';
      return result;
    }
    if (profile.screened !== true) {
      result.reason = '请先完成健康适用性确认；孕哺期、伤病、持续疼痛或需特殊饮食的情况请先咨询专业人员。';
      return result;
    }
    let activity = Number(profile.activity ?? 1.35);
    if (!Number.isFinite(activity)) activity = 1.35;
    activity = Math.max(1.2, Math.min(1.7, activity));
    result.bmr = Math.round(10 * weight + 6.25 * height - 5 * age + (profile.sex === 'male' ? 5 : -161));
    result.tdee = Math.round(result.bmr * activity);
    result.calories = Math.round(profile.goal === 'fatloss' ? Math.max(result.bmr, result.tdee - Math.min(250, result.tdee * 0.1)) : result.tdee);
    result.protein = Math.round(weight * 1.6);
    result.fat = Math.round(result.calories * 0.3 / 9);
    result.carbs = Math.max(0, Math.round((result.calories - result.protein * 4 - result.fat * 9) / 4));
    const autoRecommendationThreshold = profile.sex === 'female' ? 1500 : 1800;
    if (result.calories < autoRecommendationThreshold) {
      result.reason = `本原型无法为当前信息给出适用的自动能量建议，请由营养专业人员评估。女性 1500、男性 1800 千卡仅为本原型的保守自动推荐门槛，不是通用安全线，也不应据此自行设定摄入量。`;
      result.warnings.push('该计算结果仅供内部适用性判断，不生成自动饮食计划。');
      return result;
    }
    result.eligible = true;
    result.warnings.push('能量与营养素为起始参考，不是医疗处方；根据饥饿感、恢复和 2–4 周趋势复盘，不靠少吃或补练惩罚自己。');
    if (Array.isArray(profile.posture) && profile.posture.some((item) => item !== 'none')) {
      result.warnings.push('体态困扰用于提醒动作控制，不作诊断或矫正承诺；出现疼痛请停止相关动作并评估。');
    }
    return result;
  }

  function schedule(profile, dateISO) {
    const config = cycleConfig(profile);
    const start = parseDay(profile.startDate);
    const day = parseDay(dateISO);
    if (!start || !day) throw new RangeError('请使用有效的 YYYY-MM-DD 日期。');
    const dayIndex = Math.round((day.stamp - start.stamp) / DAY_MS);
    if (dayIndex < 0) {
      return { date: dateISO, dayIndex, cycleIndex: -1, cycleDay: 0, isTraining: false, type: 'rest', beforeStart: true };
    }
    const cycleIndex = Math.floor(dayIndex / config.length);
    const withinCycle = dayIndex % config.length;
    const isTraining = withinCycle < config.trainDays;
    const type = !isTraining ? 'rest' : withinCycle % 2 === 0 ? 'strength' : 'active';
    return { date: dateISO, dayIndex, cycleIndex, cycleDay: withinCycle + 1, isTraining, type, beforeStart: false };
  }

  function accumulatedExtra(adjustments, dateISO) {
    return Math.min(MAX_EXTRA_MINUTES, Math.max(0, (Array.isArray(adjustments) ? adjustments : [])
      .filter((adjustment) => adjustment && adjustment.date === dateISO)
      .reduce((sum, adjustment) => sum + Math.max(0, Number(adjustment.minutes) || 0), 0)));
  }

  // Fixed starting doses, not an automatic progression based only on elapsed time.
  function repetition(id, sets, repetitions, rest, sides = 1, note = '') {
    return { id, sets, repetitions, reps: `${sides === 2 ? '每侧 ' : ''}${repetitions} 次`, rest, sides, note: `${REP_TARGET_NOTE}${note ? ` ${note}` : ''}` };
  }

  function hold(id, sets, seconds, rest, sides = 1, note = '') {
    return { id, sets, seconds, reps: `${sides === 2 ? '每侧 ' : ''}${seconds} 秒`, rest, sides, note };
  }

  function themedMoves(profile, themeIndex) {
    const regular = profile.level === 'regular';
    const jumps = regular && profile.lowImpact === false;
    const sets = regular ? 3 : 2;
    const push = regular ? 'pushup' : 'knee-pushup';
    const stable = '呼吸自然，动作走样前结束；可以少做一组。';
    const themes = [
      {
        id: 'full-body', title: '全身燃脂 · 基础组合',
        subtitle: '蹲、推与核心组合，建立全身运动习惯；按顺序完成每个动作的所有组。',
        moves: [
          repetition('squat', sets, regular ? 12 : 10, 90),
          repetition(push, sets, regular ? 12 : 10, regular ? 120 : 90, 1, regular ? '吃力时改为跪姿俯卧撑。' : '膝下垫软垫；仍吃力时抬高手部降低难度，或结束本组。'),
          repetition('lunge', sets, regular ? 12 : 10, regular ? 120 : 90, 2, '每组包含左右两侧；可扶稳固支撑物，缩小下蹲幅度。'),
          hold('plank', 2, regular ? 30 : 20, 60, 1, stable)
        ]
      },
      {
        id: 'lower-body', title: '下肢塑型 · 腿臀控制',
        subtitle: '练习腿臀发力与单侧稳定；塑型指力量与控制，不代表局部减脂。',
        moves: [
          repetition('squat', sets, regular ? 12 : 10, 90),
          repetition('lunge', sets, regular ? 12 : 10, regular ? 120 : 90, 2, '先左右交替，每侧完成目标后再记录一组。'),
          repetition('side-leg-raise', 2, regular ? 12 : 10, 60, 2, '左右各完成标示次数算一组，不用抬得很高。'),
          hold('wall-sit', 2, regular ? 30 : 20, 75, 1, '背部轻贴墙，在无痛的浅蹲位置停留，不必追求大腿水平。')
        ]
      },
      {
        id: 'core', title: '核心稳定 · 支撑与控制',
        subtitle: '练习躯干控制，保持自然呼吸；每组包含标示的左右两侧。',
        moves: [
          repetition(push, 2, regular ? 12 : 10, regular ? 120 : 90, 1, '吃力时用跪姿或抬高手部，肩腕不适则跳过。'),
          hold('plank', 2, regular ? 30 : 20, 60, 1, stable),
          hold('side-plank', 2, regular ? 30 : 20, 75, 2, '起步可下侧屈膝支撑，左右各完成一次算一组；姿势不稳可提前结束。'),
          repetition('crunch', 2, regular ? 12 : 10, 60, 1, '仅抬起肩胛骨，不用手拉颈部。'),
          repetition('russian-twist', 2, regular ? 12 : 10, 75, 2, '双脚踩地，小幅转动胸廓，腰背有不适时跳过。')
        ]
      },
      {
        id: 'coordination', title: '全身协调 · 稳定心肺',
        subtitle: '把基础力量与短时动态动作结合；先求稳定，再考虑速度。',
        moves: [
          repetition('squat', sets, regular ? 12 : 10, 90),
          repetition(push, 2, regular ? 12 : 10, regular ? 120 : 90, 1, '按能力用跪姿或抬高手部降低难度。'),
          repetition('shoulder-tap', 2, regular ? 12 : 10, regular ? 90 : 75, 2, '放慢触肩，双脚分开；起步可双膝着地，骨盆保持稳定。'),
          repetition('mountain-climber', 2, regular ? 12 : 10, 90, 2, '慢速交替提膝，一侧提膝算该侧一次；先走步、不弹跳，腰背保持稳定。'),
          repetition('high-knees', 2, regular ? 12 : 10, 60, 2, '原地踏步提膝，一侧提膝算该侧一次；抬到舒适高度，不追求速度。')
        ]
      }
    ];
    const theme = themes[themeIndex % themes.length];
    // Jumping is opt-in, confined to a small dose, and never included for beginners.
    if (jumps && theme.id === 'full-body') {
      theme.moves.push(repetition('jumping-jack', 2, 10, 90, 1, '一次打开再合拢计一次；轻落地，不适时用左右侧踏代替或跳过。'));
    }
    if (jumps && theme.id === 'coordination') {
      theme.moves[0] = repetition('squat-jump', 2, 10, 120, 1, '仅限已有基础并自选跳跃者；这是小幅协调练习，不追最大跳高。浅蹲轻跳、落地稳住；控制变差就改普通深蹲 10 次或结束本组。');
    }
    return theme;
  }

  function cardioBlock(profile, recovery = false) {
    const regular = profile.level === 'regular';
    const preferredType = CARDIO_OPTIONS.includes(profile.cardioPreference) ? profile.cardioPreference : 'walking';
    // A light day stays light even if the normal preference is running or stairs.
    const type = recovery ? (preferredType === 'swimming' ? 'swimming' : 'walking') : preferredType;
    const targetMinutes = recovery ? (regular ? 25 : 15) : type === 'stairs' ? (regular ? 8 : 5) : (regular ? 15 : 10);
    const notes = {
      walking: recovery ? '轻松步行，能够完整、舒适地交谈。' : '以能说话但难以唱歌的舒适快走为参考，太累时放慢。',
      running: regular ? '轻松跑，能完整说话；呼吸吃力时立即转为步行。' : '走跑交替：走 1–2 分钟、慢跑约 30 秒，按状态重复；也可全程快走。',
      incline: '选择温和坡度或低坡度跑步机，慢走起步；无需追求固定坡度或速度。',
      stairs: '慢速上楼，扶好栏杆；上行约 30–60 秒后休息或平地慢走，按状态重复。',
      swimming: recovery ? '轻松戏水或舒缓游动，充分休息；不要用连续冲刺游代替恢复。' : '在有人值守的泳池轻松游动，按泳技和呼吸随时停歇，不憋气冲距离。'
    };
    return {
      type, label: recovery && type === 'walking' ? '轻松步行' : CARDIO_NAMES[type],
      preferredType, targetMinutes,
      intensity: recovery ? '恢复强度 · 可以轻松完整对话' : '从轻到中等 · 保持可控呼吸',
      options: CARDIO_OPTIONS.slice(), note: notes[type], recovery,
      selectionNote: recovery && preferredType !== type ? `今天是恢复有氧日，已将${CARDIO_NAMES[preferredType]}偏好改为轻松步行。` : ''
    };
  }

  function estimatedStrengthMinutes(moves) {
    const seconds = moves.reduce((sum, move) => {
      const oneSet = move.seconds || move.repetitions * 3;
      return sum + oneSet * (move.sides || 1) * move.sets + Math.max(0, move.sets - 1) * move.rest + 45;
    }, 0);
    return Math.ceil(seconds / 60);
  }

  function plan(profile, dateISO, adjustments = []) {
    const day = schedule(profile, dateISO);
    const nutrition = estimate(profile);
    const empty = { ...day, title: '恢复也是计划的一部分', subtitle: '给身体恢复的时间，保持正常饮食与睡眠。', minutes: 0, moves: [], walkMinutes: 0, extraMinutes: 0, warmupMinutes: 0, cooldownMinutes: 0, strengthMinutes: 0, cardio: null, theme: 'rest', notes: [] };
    if (!nutrition.eligible) return { ...empty, type: 'rest', isTraining: false, title: '先完成适用性评估', subtitle: nutrition.reason };
    if (day.beforeStart) return { ...empty, title: '计划尚未开始', subtitle: '从你设定的开始日期按练休周期安排活动。' };
    if (day.type === 'rest') return empty;
    const extraMinutes = accumulatedExtra(adjustments, dateISO);
    const warmupMinutes = 5, cooldownMinutes = 5;
    if (day.type === 'active') {
      const cardio = cardioBlock(profile, true);
      return {
        ...day, theme: 'aerobic-recovery', title: '有氧恢复 · 舒展心肺',
        subtitle: '力量训练之间放轻松，今天不做冲刺或跳跃；舒适完成即可。',
        minutes: warmupMinutes + cardio.targetMinutes + cooldownMinutes,
        warmupMinutes, cooldownMinutes, strengthMinutes: 0,
        walkMinutes: cardio.type === 'walking' ? cardio.targetMinutes : 0,
        cardio, extraMinutes, moves: [], notes: ['本次总时长包含热身与整理，额外轻活动另计。', '如酸痛或疲惫明显，可以按休息日恢复，不必为了打卡硬练。']
      };
    }
    const config = cycleConfig(profile);
    const strengthIndex = day.cycleIndex * Math.ceil(config.trainDays / 2) + Math.floor((day.cycleDay - 1) / 2);
    const theme = themedMoves(profile, strengthIndex);
    const cardio = cardioBlock(profile);
    const strengthMinutes = estimatedStrengthMinutes(theme.moves);
    return {
      ...day, theme: theme.id, title: theme.title, subtitle: theme.subtitle,
      minutes: warmupMinutes + strengthMinutes + cardio.targetMinutes + cooldownMinutes,
      warmupMinutes, cooldownMinutes, strengthMinutes,
      walkMinutes: cardio.type === 'walking' ? cardio.targetMinutes : 0,
      cardio, extraMinutes, moves: theme.moves,
      notes: [REP_TARGET_NOTE, '先热身，再按动作逐组练习，最后有氧与整理；计时与时长均为起始参考。', '组间休息可延长至 2–3 分钟，恢复呼吸且能保持动作稳定后再继续。', '静态支撑按秒计，单侧动作每侧分别完成目标；不按日期自动加量。稳定适应后可在档案中自选训练基础。']
    };
  }

  function redistribute(profile, missedDate, mode, adjustments = [], notBeforeDate) {
    const config = cycleConfig(profile);
    const missed = schedule(profile, missedDate);
    if (!['current', 'next', 'extend'].includes(mode)) throw new RangeError('请选择顺延、本周期或下周期。');
    const notBefore = notBeforeDate === undefined || notBeforeDate === null ? null : parseDay(notBeforeDate);
    if (notBeforeDate !== undefined && notBeforeDate !== null && !notBefore) throw new RangeError('调整参考日必须是有效的 YYYY-MM-DD 日期。');
    const existing = [];
    const normalized = new Map();
    for (const adjustment of Array.isArray(adjustments) ? adjustments : []) {
      if (!adjustment || !parseDay(adjustment.date)) continue;
      const day = schedule(profile, adjustment.date);
      const minutes = Number(adjustment.minutes);
      if (!day.isTraining || !Number.isFinite(minutes) || minutes <= 0) continue;
      normalized.set(adjustment.date, Math.min(MAX_EXTRA_MINUTES, (normalized.get(adjustment.date) || 0) + minutes));
    }
    for (const [date, minutes] of normalized) existing.push({ date, minutes });
    existing.sort((a, b) => a.date.localeCompare(b.date));
    if (!estimate(profile).eligible || !missed.isTraining) {
      return { adjustments: existing, additions: [], extensionDays: 0, reason: '该日期没有适用的运动安排，无需补练。', allocatedMinutes: 0, remainingMinutes: 0 };
    }
    if (mode === 'extend') {
      return { adjustments: existing, additions: [], extensionDays: config.length, reason: `参考日期顺延 ${config.length} 天，留出一个练休周期重新找到节奏；无需补回漏练。`, allocatedMinutes: 0, remainingMinutes: MISSED_MINUTES };
    }
    const start = parseDay(profile.startDate);
    const targetCycle = mode === 'current' ? missed.cycleIndex : missed.cycleIndex + 1;
    const cycleStart = targetCycle * config.length;
    const additions = [];
    let remainingMinutes = MISSED_MINUTES;
    for (let i = 0; i < config.trainDays && remainingMinutes > 0; i += 1) {
      const absoluteDay = cycleStart + i;
      if (absoluteDay <= missed.dayIndex) continue;
      const date = isoDayFromStamp(start.stamp + absoluteDay * DAY_MS);
      if (notBefore && parseDay(date).stamp <= notBefore.stamp) continue;
      const previousMinutes = normalized.get(date) || 0;
      const minutes = Math.min(MAX_EXTRA_MINUTES - previousMinutes, remainingMinutes);
      if (minutes <= 0) continue;
      normalized.set(date, previousMinutes + minutes);
      additions.push({ date, minutes });
      remainingMinutes -= minutes;
    }
    const allocatedMinutes = MISSED_MINUTES - remainingMinutes;
    const extensionDays = remainingMinutes > 0 ? config.length : 0;
    const outputAdjustments = Array.from(normalized, ([date, minutes]) => ({ date, minutes })).sort((a, b) => a.date.localeCompare(b.date));
    const period = mode === 'current' ? '本周期剩余' : '下周期';
    const reason = allocatedMinutes > 0
      ? `已在${period}运动日分配 ${allocatedMinutes} 分钟轻松步行，每天额外不超过 5 分钟。${remainingMinutes ? `其余不强行补回，参考日期顺延 ${extensionDays} 天。` : '休息日与力量训练组数保持原安排。'}`
      : `该周期没有可用的轻活动余量，参考日期顺延 ${extensionDays} 天；无需挤占休息或强行补练。`;
    return { adjustments: outputAdjustments, additions, extensionDays, reason, allocatedMinutes, remainingMinutes };
  }

  global.FitEngine = Object.freeze({ estimate, schedule, plan, redistribute, trainingSources, planningNotes });
})(typeof window !== 'undefined' ? window : globalThis);
