/* One bodyweight movement library; location is not an exercise category. */
(function () {
  'use strict';
  const movements = [
    { id: 'squat', name: '深蹲', sets: 2, reps: '10–12 次', rest: '90 秒', focus: '下肢 · 臀腿', level: '基础', impact: '低冲击', cues: ['双脚约与肩同宽，脚跟踩稳，膝盖顺着脚尖方向。', '臀部向后下坐，在舒适范围内下蹲，不追求固定深度。', '呼气站起，每组保留 2–3 次余力，动作稳定后再增加次数。'] },
    { id: 'pushup', name: '俯卧撑', sets: 2, reps: '10–12 次', rest: '90–120 秒', focus: '胸部 · 手臂 · 核心', level: '进阶', impact: '低冲击', alternative: 'knee-pushup', cues: ['双手略宽于肩，身体从头到脚跟保持稳定。', '屈肘时上臂与躯干约成 30–45 度，胸部缓慢靠近地面。', '呼气推起，不塌腰；无法稳定完成时改为跪姿俯卧撑或抬高手部。'] },
    { id: 'lunge', name: '交替弓步', sets: 2, reps: '每侧 10–12 次', rest: '90–120 秒', focus: '下肢 · 单腿稳定', level: '基础', impact: '低冲击', cues: ['站稳后向后撤出一步，双脚左右留出距离，避免走在同一条细线上。', '缓慢屈膝，前脚全脚掌着地，前膝顺着脚尖方向。', '推地回到站姿后换侧；只在稳定、无痛的范围内下蹲，可扶稳固支撑。'] },
    { id: 'plank', name: '平板支撑', sets: 2, reps: '20–30 秒', seconds: 20, rest: '60–90 秒', focus: '核心 · 躯干稳定', level: '基础', impact: '低冲击', cues: ['前臂着地，肘部大致在肩膀下方，双脚留出稳定间距。', '轻收腹和臀部，头、背、髋保持自然连线，不塌腰或抬臀。', '正常呼吸，姿势开始变形就结束这一组；可膝盖着地降低难度。'] },
    { id: 'mountain-climber', name: '登山跑', sets: 2, reps: '每侧 10–12 次', rest: '90 秒', focus: '核心 · 心肺协调', level: '进阶', impact: '可慢速', cues: ['从双手支撑的高平板开始，手腕大致在肩下，背部保持稳定。', '交替将膝盖缓慢收向胸前，再把脚送回，不急着跑快。', '避免腰部下沉或骨盆大幅摇晃；手腕或腰部不适时停止。'] },
    { id: 'crunch', name: '卷腹', sets: 2, reps: '10–12 次', rest: '60–75 秒', focus: '腹部 · 控制', level: '基础', impact: '低冲击', cues: ['仰卧屈膝，双脚平放，双手可交叉放胸前。', '呼气时让肩胛骨轻轻离地，视线朝斜上方，保持颈部放松。', '吸气缓慢放下，幅度较小即可；不拉拽头颈，也不靠惯性坐起。'] },
    { id: 'side-plank', name: '侧平板', sets: 2, reps: '每侧 20–30 秒', seconds: 20, rest: '75–90 秒', focus: '侧腹 · 髋部稳定', level: '进阶', impact: '低冲击', cues: ['侧卧以前臂支撑，肘部位于肩下，双脚前后错开增加稳定。', '轻抬髋部，让肩、髋、脚尽量保持自然直线，持续正常呼吸。', '每组左右两侧都做；新手可屈膝支撑，肩部不适时停止。'] },
    { id: 'wall-sit', name: '靠墙深蹲', sets: 2, reps: '20–30 秒', seconds: 20, rest: '75–90 秒', focus: '下肢 · 静态耐力', level: '基础', impact: '低冲击', cues: ['背部靠稳墙面，双脚向前移出适当距离，与髋同宽。', '沿墙缓慢下滑到舒适浅蹲，膝盖顺着脚尖，不必强求 90 度。', '保持呼吸和全脚掌着地，到时缓慢起身；膝部疼痛时停止。'] },
    { id: 'side-leg-raise', name: '侧卧抬腿', sets: 2, reps: '每侧 10–15 次', rest: '60–75 秒', focus: '臀部 · 髋外侧', level: '基础', impact: '低冲击', cues: ['侧卧保持肩和髋上下叠放，下侧腿可稍屈帮助稳定。', '上侧腿伸直，脚尖朝前，小幅抬起，不用追求高度。', '缓慢放回但不砸落，避免骨盆后倒；一侧完成后换另一侧。'] },
    { id: 'knee-pushup', name: '跪姿俯卧撑', sets: 2, reps: '10–12 次', rest: '90–120 秒', focus: '胸部 · 手臂', level: '基础', impact: '低冲击', cues: ['在垫上以膝盖和双手支撑，双手略宽于肩，肩到膝保持自然直线。', '屈肘让胸部缓慢靠近垫面，上臂不用向两侧完全打开。', '呼气推回，不塌腰；膝盖下方加软垫，必要时抬高手部降低难度。'] },
    { id: 'shoulder-tap', name: '平板肩碰', sets: 2, reps: '每侧 10–12 次', rest: '75–90 秒', focus: '核心 · 抗旋转', level: '进阶', impact: '低冲击', cues: ['从双手支撑的高平板开始，双脚适当分开。', '慢慢抬起一只手轻碰对侧肩膀，再放回，随后换手。', '尽量让骨盆保持平稳；可膝盖着地或抬高手部，避免身体左右甩动。'] },
    { id: 'russian-twist', name: '俄罗斯转体', sets: 2, reps: '每侧 10–12 次', rest: '75–90 秒', focus: '核心 · 旋转控制', level: '进阶', impact: '低冲击', cues: ['坐姿屈膝，双脚始终着地，身体轻微后倾，背部保持自然。', '双手放胸前，带动胸廓小幅转向一侧，再缓慢转向另一侧。', '不加负重、不追求触地或大幅扭腰；腰背不适者跳过此动作。'] },
    { id: 'jumping-jack', name: '开合跳', sets: 2, reps: '10–15 次', rest: '90–120 秒', focus: '心肺 · 全身协调', level: '进阶', impact: '跳跃', cues: ['从双脚并拢开始，小幅向两侧跳开，手臂同步向上打开。', '双脚合回，屈膝轻柔落地，维持可控制的节奏。', '低冲击替代：改为左右交替侧踏步开合，不离地跳跃。'] },
    { id: 'high-knees', name: '高抬腿', sets: 2, reps: '每侧 10–15 次', rest: '60–90 秒', focus: '心肺 · 下肢协调', level: '基础', impact: '可踏步', cues: ['身体自然直立，双臂配合摆动，交替抬起膝盖。', '高度以舒适、能保持稳定为准，脚落地时轻柔，不后仰。', '新手先做原地抬膝踏步；熟练后再小幅提速，不必追求动画速度。'] },
    { id: 'squat-jump', name: '深蹲跳', sets: 2, reps: '10 次', rest: '120 秒', focus: '下肢 · 爆发协调', level: '进阶', impact: '跳跃', alternative: 'squat', cues: ['先掌握稳定的徒手深蹲，再从舒适浅蹲开始小幅跳起。', '落地时脚掌缓冲、髋膝轻屈，膝盖顺着脚尖，稳住后再做下一次。', '本动作不作为新手默认项；膝踝不适、疲劳或低冲击需求时改为普通深蹲。'] }
  ];
  movements.forEach(m => {
    m.doseNote = m.seconds ? '静态动作按秒保持；姿势不稳可提前结束。' : '10 次起为目标，可降难度；动作走样时结束，不强凑次数。';
    if (m.id === 'squat-jump') m.doseNote += '仅有基础者选做小幅跳跃；不追最大高度，2 组 × 10 次、休息 120 秒。落地不稳可改普通深蹲 10 次。';
  });
  window.MOVE_LIBRARY = movements;
  window.renderMoveAnimation = function (id, character = 'spongebob', still = false) {
    return window.renderAthleteMove(id, character, still);
  };
  window.renderFitnessMascot = function(character='spongebob'){return window.renderAthletePortrait(character);};
})();
