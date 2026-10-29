/* Original, dependency-free ranking data model. Browser: RankingModel; Node: require(). */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RankingModel = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const LIMITS = Object.freeze({ rows: 20, items: 200, title: 100, name: 80, rowName: 30,
    imageBytes: 1024 * 1024, totalImageBytes: 20 * 1024 * 1024, jsonBytes: 30 * 1024 * 1024,
    imageSide: 4096, imagePixels: 16 * 1024 * 1024, totalImagePixels: 64000000 });
  const FOOD_ART = Object.freeze({
    hotpot: Object.freeze({ name: '火锅', emoji: '🍲', bg: '#f9e2d4', photo: '/assets/foods/hotpot.webp' }),
    dumpling: Object.freeze({ name: '饺子', emoji: '🥟', bg: '#f7eed8', photo: '/assets/foods/dumpling.webp' }),
    noodles: Object.freeze({ name: '面条', emoji: '🍜', bg: '#f4e6cf', photo: '/assets/foods/noodles.webp' }),
    sushi: Object.freeze({ name: '寿司', emoji: '🍣', bg: '#f5e3e3', photo: '/assets/foods/sushi.webp' }),
    burger: Object.freeze({ name: '汉堡', emoji: '🍔', bg: '#f6e6c7', photo: '/assets/foods/burger.webp' }),
    pizza: Object.freeze({ name: '披萨', emoji: '🍕', bg: '#f8e0c8', photo: '/assets/foods/pizza.webp' }),
    chicken: Object.freeze({ name: '炸鸡', emoji: '🍗', bg: '#f3ddc4', photo: '/assets/foods/chicken.webp' }),
    tea: Object.freeze({ name: '奶茶', emoji: '🧋', bg: '#e6ddcf', photo: '/assets/foods/tea.webp' }),
    watermelon: Object.freeze({ name: '西瓜', emoji: '🍉', bg: '#e4eed7', photo: '/assets/foods/watermelon.webp' }),
    cake: Object.freeze({ name: '蛋糕', emoji: '🍰', bg: '#f3dfdf', photo: '/assets/foods/cake.webp' }),
    'mianyang-rice-noodles': Object.freeze({ name: '绵阳米粉', emoji: '🍜', bg: '#f4e6cf', photo: '/assets/foods/mianyang-rice-noodles.webp' }),
    'jiaxing-zongzi': Object.freeze({ name: '嘉兴粽子', emoji: '🍙', bg: '#e5ecd7', photo: '/assets/foods/jiaxing-zongzi.webp' }),
    houttuynia: Object.freeze({ name: '折耳根', emoji: '🌿', bg: '#e5ecd7', photo: '/assets/foods/houttuynia.webp' }),
    'frozen-dumplings': Object.freeze({ name: '速冻水饺', emoji: '🥟', bg: '#f7eed8', photo: '/assets/foods/frozen-dumplings.webp' }),
    douzhi: Object.freeze({ name: '豆汁', emoji: '🥣', bg: '#e6ddcf', photo: '/assets/foods/douzhi.webp' }),
    durian: Object.freeze({ name: '榴莲', emoji: '🥭', bg: '#f7eed8', photo: '/assets/foods/durian.webp' }),
    'loofah-noodles': Object.freeze({ name: '丝瓜面', emoji: '🍜', bg: '#e5ecd7', photo: '/assets/foods/loofah-noodles.webp' }),
    mooncake: Object.freeze({ name: '月饼', emoji: '🥮', bg: '#f6e6c7', photo: '/assets/foods/mooncake.webp' }),
    'pea-mince-noodles': Object.freeze({ name: '豌杂面', emoji: '🍜', bg: '#f4e6cf', photo: '/assets/foods/pea-mince-noodles.webp' }),
    'handmade-dumplings': Object.freeze({ name: '手工水饺', emoji: '🥟', bg: '#f7eed8', photo: '/assets/foods/handmade-dumplings.webp' }),
    'japanese-ramen': Object.freeze({ name: '日本拉面', emoji: '🍜', bg: '#f4e6cf', photo: '/assets/foods/japanese-ramen.webp' }),
    'egg-noodles': Object.freeze({ name: '鸡蛋挂面', emoji: '🍜', bg: '#f4e6cf', photo: '/assets/foods/egg-noodles.webp' }),
    'bak-kut-teh': Object.freeze({ name: '肉骨茶', emoji: '🍲', bg: '#f9e2d4', photo: '/assets/foods/bak-kut-teh.webp' }),
    'dongpo-pork': Object.freeze({ name: '东坡肉', emoji: '🍖', bg: '#f3ddc4', photo: '/assets/foods/dongpo-pork.webp' }),
    'sea-intestine-rice': Object.freeze({ name: '海肠捞饭', emoji: '🍚', bg: '#f7eed8', photo: '/assets/foods/sea-intestine-rice.webp' }),
    'eight-treasure-tofu': Object.freeze({ name: '八珍豆腐', emoji: '🥘', bg: '#f7eed8', photo: '/assets/foods/eight-treasure-tofu.webp' }),
    'vietnamese-chicken-noodles': Object.freeze({ name: '越南鸡丝米粉', emoji: '🍜', bg: '#f4e6cf', photo: '/assets/foods/vietnamese-chicken-noodles.webp' }),
    'pad-krapow-rice': Object.freeze({ name: '打抛饭', emoji: '🍛', bg: '#f7eed8', photo: '/assets/foods/pad-krapow-rice.webp' }),
    'egg-tart': Object.freeze({ name: '蛋挞', emoji: '🥧', bg: '#f6e6c7', photo: '/assets/foods/egg-tart.webp' }),
    barbecue: Object.freeze({ name: '烧烤', emoji: '🍢', bg: '#f3ddc4', photo: '/assets/foods/barbecue.webp' }),
    'lamb-shumai': Object.freeze({ name: '羊肉烧麦', emoji: '🥟', bg: '#f7eed8', photo: '/assets/foods/lamb-shumai.webp' }),
    'zhejiang-dry-noodles': Object.freeze({ name: '浙江干挑面', emoji: '🍜', bg: '#f4e6cf', photo: '/assets/foods/zhejiang-dry-noodles.webp' }),
    bread: Object.freeze({ name: '面包', emoji: '🍞', bg: '#f6e6c7', photo: '/assets/foods/bread.webp' }),
    'lanzhou-noodles': Object.freeze({ name: '兰州拉面', emoji: '🍜', bg: '#f4e6cf', photo: '/assets/foods/lanzhou-noodles.webp' }),
    'beijing-zhajiang-noodles': Object.freeze({ name: '北京杂酱面', emoji: '🍜', bg: '#f4e6cf', photo: '/assets/foods/beijing-zhajiang-noodles.webp' }),
    'west-lake-vinegar-fish': Object.freeze({ name: '西湖醋鱼', emoji: '🐟', bg: '#f9e2d4', photo: '/assets/foods/west-lake-vinegar-fish.webp' }),
    'donkey-burger': Object.freeze({ name: '驴肉火烧', emoji: '🥙', bg: '#f6e6c7', photo: '/assets/foods/donkey-burger.webp' }),
    'smoked-pork-flatbread': Object.freeze({ name: '熏肉大饼', emoji: '🥙', bg: '#f6e6c7', photo: '/assets/foods/smoked-pork-flatbread.webp' }),
    'sichuan-hotpot': Object.freeze({ name: '四川火锅', emoji: '🍲', bg: '#f9e2d4', photo: '/assets/foods/sichuan-hotpot.webp' })
  });
  const SPORT_ART = Object.freeze({
    walking: Object.freeze({ name: '散步', emoji: '🚶', bg: '#e5ecd7', photo: '/assets/sports/walking.webp' }),
    hiking: Object.freeze({ name: '登山', emoji: '🥾', bg: '#e5ecd7', photo: '/assets/sports/hiking.webp' }),
    running: Object.freeze({ name: '跑步', emoji: '🏃', bg: '#e5ecd7', photo: '/assets/sports/running.webp' }),
    'weight-training': Object.freeze({ name: '撸铁', emoji: '🏋️', bg: '#e5ecd7', photo: '/assets/sports/weight-training.webp' }),
    swimming: Object.freeze({ name: '游泳', emoji: '🏊', bg: '#dcebef', photo: '/assets/sports/swimming.webp' }),
    badminton: Object.freeze({ name: '羽毛球', emoji: '🏸', bg: '#e5ecd7', photo: '/assets/sports/badminton.webp' }),
    cycling: Object.freeze({ name: '自行车', emoji: '🚴', bg: '#e5ecd7', photo: '/assets/sports/cycling.webp' }),
    football: Object.freeze({ name: '足球', emoji: '⚽', bg: '#e5ecd7', photo: '/assets/sports/football.webp' }),
    tennis: Object.freeze({ name: '网球', emoji: '🎾', bg: '#e5ecd7', photo: '/assets/sports/tennis.webp' }),
    'table-tennis': Object.freeze({ name: '乒乓球', emoji: '🏓', bg: '#e5ecd7', photo: '/assets/sports/table-tennis.webp' }),
    'combat-training': Object.freeze({ name: '搏斗', emoji: '🥊', bg: '#e5ecd7', photo: '/assets/sports/combat-training.webp' }),
    'tree-climbing': Object.freeze({ name: '爬树', emoji: '🌳', bg: '#e5ecd7', photo: '/assets/sports/tree-climbing.webp' }),
    skydiving: Object.freeze({ name: '跳伞', emoji: '🪂', bg: '#dcebef', photo: '/assets/sports/skydiving.webp' }),
    'rock-climbing': Object.freeze({ name: '攀岩', emoji: '🧗', bg: '#e5ecd7', photo: '/assets/sports/rock-climbing.webp' }),
    diving: Object.freeze({ name: '潜水', emoji: '🤿', bg: '#dcebef', photo: '/assets/sports/diving.webp' }),
    golf: Object.freeze({ name: '高尔夫', emoji: '⛳', bg: '#e5ecd7', photo: '/assets/sports/golf.webp' }),
    gaming: Object.freeze({ name: '打游戏', emoji: '🎮', bg: '#e8e3f3', photo: '/assets/sports/gaming.webp' })
  });
  const BOOK_ART = Object.freeze({
    "book-pride-and-prejudice": Object.freeze({"name":"傲慢与偏见 · Pride and Prejudice","emoji":"📖","bg":"#e8e3d9","photo":"/assets/books/book-pride-and-prejudice.webp","source":"https://www.gutenberg.org/ebooks/1342","alt_zh":"池塘与花园后的一座英国乡间庄园","alt_en":"An English country estate beyond a pond and garden"}),
    "book-jane-eyre": Object.freeze({"name":"简·爱 · Jane Eyre","emoji":"📖","bg":"#e8e3d9","photo":"/assets/books/book-jane-eyre.webp","source":"https://www.gutenberg.org/ebooks/1260","alt_zh":"薄雾中有一扇暖色窗户的古老石宅","alt_en":"An old stone manor with one warm window in the mist"}),
    "book-wuthering-heights": Object.freeze({"name":"呼啸山庄 · Wuthering Heights","emoji":"📖","bg":"#e8e3d9","photo":"/assets/books/book-wuthering-heights.webp","source":"https://www.gutenberg.org/ebooks/768","alt_zh":"荒原上被风吹拂的石屋与石墙","alt_en":"A stone farmhouse and wall on a windswept moor"}),
    "book-a-tale-of-two-cities": Object.freeze({"name":"双城记 · A Tale of Two Cities","emoji":"📖","bg":"#e8e3d9","photo":"/assets/books/book-a-tale-of-two-cities.webp","source":"https://www.gutenberg.org/ebooks/98","alt_zh":"晨雾中连接古老城市两岸的石桥","alt_en":"A stone bridge between old city riverbanks in morning mist"}),
    "book-great-expectations": Object.freeze({"name":"远大前程 · Great Expectations","emoji":"📖","bg":"#e8e3d9","photo":"/assets/books/book-great-expectations.webp","source":"https://www.gutenberg.org/ebooks/1400","alt_zh":"昏暗老宅里摆着枯花的旧宴桌","alt_en":"An abandoned banquet table with dried flowers in a dim old house"}),
    "book-robinson-crusoe": Object.freeze({"name":"鲁滨逊漂流记 · Robinson Crusoe","emoji":"📖","bg":"#e8e3d9","photo":"/assets/books/book-robinson-crusoe.webp","source":"https://www.gutenberg.org/ebooks/521","alt_zh":"海岛棕榈树下的简陋木屋与沙滩足印","alt_en":"A rough island shelter under palms beside a footprint in the sand"}),
    "book-gullivers-travels": Object.freeze({"name":"格列佛游记 · Gulliver’s Travels","emoji":"📖","bg":"#e8e3d9","photo":"/assets/books/book-gullivers-travels.webp","source":"https://www.gutenberg.org/ebooks/829","alt_zh":"一艘大木艇旁显得微小的海边城镇","alt_en":"A miniature seaside town beside an enormous wooden skiff"}),
    "book-frankenstein": Object.freeze({"name":"弗兰肯斯坦 · Frankenstein","emoji":"📖","bg":"#e8e3d9","photo":"/assets/books/book-frankenstein.webp","source":"https://www.gutenberg.org/ebooks/84","alt_zh":"暴风雪山景窗前的一张旧实验台","alt_en":"An old laboratory bench before a stormy Alpine window"}),
    "book-alice-in-wonderland": Object.freeze({"name":"爱丽丝漫游奇境 · Alice’s Adventures in Wonderland","emoji":"📖","bg":"#e8e3d9","photo":"/assets/books/book-alice-in-wonderland.webp","source":"https://www.gutenberg.org/ebooks/11","alt_zh":"林中白兔、蘑菇与一只素面茶杯","alt_en":"A white rabbit, mushrooms and a plain teacup in a woodland clearing"}),
    "book-treasure-island": Object.freeze({"name":"金银岛 · Treasure Island","emoji":"📖","bg":"#e8e3d9","photo":"/assets/books/book-treasure-island.webp","source":"https://www.gutenberg.org/ebooks/120","alt_zh":"海湾沙滩上打开的旧木箱与远处帆船","alt_en":"An open weathered chest on a beach with a distant sailing ship"}),
    "book-sherlock-holmes": Object.freeze({"name":"福尔摩斯探案集 · The Adventures of Sherlock Holmes","emoji":"📖","bg":"#e8e3d9","photo":"/assets/books/book-sherlock-holmes.webp","source":"https://www.gutenberg.org/ebooks/1661","alt_zh":"伦敦窗景前的放大镜、烟斗与无字信封","alt_en":"A magnifying glass, pipe and blank envelope before a misty London window"}),
    "book-dorian-gray": Object.freeze({"name":"道林·格雷的画像 · The Picture of Dorian Gray","emoji":"📖","bg":"#e8e3d9","photo":"/assets/books/book-dorian-gray.webp","source":"https://www.gutenberg.org/ebooks/174","alt_zh":"暗室里用绒布完全遮住的画框与枯玫瑰","alt_en":"A completely draped picture frame and a wilted rose in a dark room"}),
    "book-moby-dick": Object.freeze({"name":"白鲸 · Moby-Dick","emoji":"📖","bg":"#e8e3d9","photo":"/assets/books/book-moby-dick.webp","source":"https://www.gutenberg.org/ebooks/2701","alt_zh":"灰蓝海浪间浮现的巨大白鲸与远处帆船","alt_en":"A vast pale whale emerging through grey-blue waves with a distant sailing ship"}),
    "book-tom-sawyer": Object.freeze({"name":"汤姆·索亚历险记 · The Adventures of Tom Sawyer","emoji":"📖","bg":"#e8e3d9","photo":"/assets/books/book-tom-sawyer.webp","source":"https://www.gutenberg.org/ebooks/74","alt_zh":"夏日树荫下的白木栅栏、漆桶与刷子","alt_en":"A white wooden fence, paint bucket and brush in summer shade"}),
    "book-huckleberry-finn": Object.freeze({"name":"哈克贝利·费恩历险记 · Adventures of Huckleberry Finn","emoji":"📖","bg":"#e8e3d9","photo":"/assets/books/book-huckleberry-finn.webp","source":"https://www.gutenberg.org/ebooks/76","alt_zh":"晨雾中的宽阔河面与简朴木筏","alt_en":"A simple wooden raft on a wide river in morning mist"}),
    "book-little-women": Object.freeze({"name":"小妇人 · Little Women","emoji":"📖","bg":"#e8e3d9","photo":"/assets/books/book-little-women.webp","source":"https://www.gutenberg.org/ebooks/514","alt_zh":"暖炉旁的四张木椅与缝纫篮","alt_en":"Four wooden chairs and a sewing basket beside a warm hearth"}),
    "book-the-great-gatsby": Object.freeze({"name":"了不起的盖茨比 · The Great Gatsby","emoji":"📖","bg":"#e8e3d9","photo":"/assets/books/book-the-great-gatsby.webp","source":"https://www.gutenberg.org/ebooks/64317","alt_zh":"暮色水面上的木码头、远处庄园与绿色微光","alt_en":"A wooden dock, distant mansion and small green beacon over dusk water"}),
    "book-hamlet": Object.freeze({"name":"哈姆雷特 · Hamlet","emoji":"📖","bg":"#e8e3d9","photo":"/assets/books/book-hamlet.webp","source":"https://www.gutenberg.org/ebooks/1524","alt_zh":"古堡窗前放在深色布上的王冠与干净颅骨","alt_en":"A crown and clean skull on dark cloth before a castle window"}),
    "book-romeo-and-juliet": Object.freeze({"name":"罗密欧与朱丽叶 · Romeo and Juliet","emoji":"📖","bg":"#e8e3d9","photo":"/assets/books/book-romeo-and-juliet.webp","source":"https://www.gutenberg.org/ebooks/1513","alt_zh":"月光与攀缘玫瑰环绕的意式石阳台","alt_en":"An Italian stone balcony with climbing roses in moonlight"}),
    "book-walden": Object.freeze({"name":"瓦尔登湖 · Walden","emoji":"📖","bg":"#e8e3d9","photo":"/assets/books/book-walden.webp","source":"https://www.gutenberg.org/ebooks/205","alt_zh":"松林湖畔的小木屋与清澈倒影","alt_en":"A small cabin and its clear reflection beside a pine-fringed pond"})
  });
  const BUILTIN_ART = Object.freeze(Object.assign({}, FOOD_ART, SPORT_ART, BOOK_ART));
  function defineTemplate(id, label, defaultTitle, itemPrefix, groups, note = '示例仅供个人演示，不代表权威评价。') {
    const levels = [['夯', '#f28b82'], ['顶级', '#f6b26b'], ['人上人', '#f9d976'], ['NPC', '#e8e5a0'], ['拉完了', '#a8cf9a']];
    return Object.freeze({ id, label, defaultTitle, itemPrefix, note, rows: Object.freeze(levels.map((level, index) => Object.freeze({
      id: 'row-' + index, name: level[0], color: level[1], artKeys: Object.freeze(groups[index].slice())
    }))) });
  }
  const TEMPLATES = Object.freeze({
    food: defineTemplate('food', '美食排行', '美食从夯到拉', 'food', [
      ['sichuan-hotpot', 'mianyang-rice-noodles', 'jiaxing-zongzi', 'dongpo-pork', 'sea-intestine-rice', 'eight-treasure-tofu', 'zhejiang-dry-noodles'],
      ['pea-mince-noodles', 'handmade-dumplings', 'burger', 'japanese-ramen', 'vietnamese-chicken-noodles', 'pad-krapow-rice', 'lamb-shumai', 'donkey-burger', 'smoked-pork-flatbread'],
      ['chicken', 'houttuynia', 'frozen-dumplings', 'egg-noodles', 'barbecue'],
      ['sushi', 'douzhi', 'bak-kut-teh', 'beijing-zhajiang-noodles', 'west-lake-vinegar-fish'],
      ['pizza', 'cake', 'tea', 'loofah-noodles', 'mooncake', 'egg-tart', 'bread', 'lanzhou-noodles']
    ]),
    sport: defineTemplate('sport', '运动排行', '运动从夯到拉', 'sport', [
      ['walking', 'hiking', 'tree-climbing', 'gaming'], ['running', 'weight-training', 'combat-training'],
      ['swimming', 'badminton', 'cycling'], ['table-tennis'], ['football', 'tennis', 'skydiving', 'rock-climbing', 'diving', 'golf']
    ], '运动示例仅为个人偏好，不构成健康或训练建议。'),
    book: defineTemplate('book', '名著排行', '名著从夯到拉', 'book', [
      ['book-alice-in-wonderland', 'book-tom-sawyer', 'book-treasure-island', 'book-sherlock-holmes'],
      ['book-little-women', 'book-robinson-crusoe', 'book-jane-eyre', 'book-the-great-gatsby'],
      ['book-pride-and-prejudice', 'book-great-expectations', 'book-frankenstein', 'book-dorian-gray'],
      ['book-a-tale-of-two-cities', 'book-gullivers-travels', 'book-huckleberry-finn', 'book-wuthering-heights'],
      ['book-moby-dick', 'book-walden', 'book-hamlet', 'book-romeo-and-juliet']
    ], '默认按英文原版的阅读体验随手排一排，只是娱乐，不是文学评价。')
  });
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  /* Weak keys let old image data be collected after an item is replaced or cleared. */
  const itemImages = new WeakMap();
  let counter = 0;
  function fail(message) { throw new Error(message); }
  function templateFor(templateId) {
    if (typeof templateId !== 'string' || !own(TEMPLATES, templateId)) fail('未知的排行模板，请选择美食排行、运动排行或名著排行。');
    return TEMPLATES[templateId];
  }
  function record(value, label, keys) {
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
      (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) fail(label + '格式不正确。');
    if (keys && Object.keys(value).some(key => !keys.includes(key))) fail(label + '包含不支持的字段。');
  }
  function text(value, max, label) {
    if (typeof value !== 'string') fail(label + '必须是文字。');
    const normalized = value.replace(/\r\n?/g, '\n').trim();
    if (!normalized || Array.from(normalized).length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(normalized))
      fail(label + '须为 1–' + max + ' 个字符，且不能含控制字符。');
    return normalized;
  }
  function id(value, label) {
    if (typeof value !== 'string' || !/^[a-z][a-z0-9_-]{0,63}$/i.test(value) || ['constructor', 'prototype', '__proto__', 'pool'].includes(value))
      fail((label || '标识') + '不合法。');
    return value;
  }
  function makeId(prefix) { return prefix + '-' + Date.now().toString(36) + '-' + (++counter).toString(36) + '-' + Math.random().toString(36).slice(2, 8); }
  function color(value) {
    if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) fail('等级颜色须为六位十六进制颜色。');
    return value.toLowerCase();
  }
  function bytesFromBase64(encoded) {
    if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(encoded, 'base64'));
    if (typeof atob === 'function') {
      const binary = atob(encoded);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
      return bytes;
    }
    fail('此浏览器无法读取图片数据。');
  }
  const u32 = (bytes, offset) => ((bytes[offset] * 0x1000000) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3]) >>> 0;
  const le24 = (bytes, offset) => bytes[offset] + (bytes[offset + 1] << 8) + (bytes[offset + 2] << 16);
  function rasterSize(bytes, mime) {
    if (mime === 'png') {
      if (bytes.length < 33 || ![137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte) ||
        u32(bytes, 8) !== 13 || String.fromCharCode(...bytes.slice(12, 16)) !== 'IHDR') fail('PNG 图片头无效。');
      return [u32(bytes, 16), u32(bytes, 20)];
    }
    if (mime === 'jpeg') {
      if (bytes[0] !== 255 || bytes[1] !== 216) fail('JPEG 图片头无效。');
      let offset = 2;
      while (offset + 3 < bytes.length) {
        if (bytes[offset++] !== 255) fail('JPEG 图片结构无效。');
        while (bytes[offset] === 255) offset++;
        const marker = bytes[offset++];
        if (marker === 217 || marker === 218) break;
        if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
        const length = bytes[offset] * 256 + bytes[offset + 1];
        if (length < 2 || offset + length > bytes.length) fail('JPEG 图片结构无效。');
        if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker)) {
          if (length < 8) fail('JPEG 图片尺寸无效。');
          return [bytes[offset + 5] * 256 + bytes[offset + 6], bytes[offset + 3] * 256 + bytes[offset + 4]];
        }
        offset += length;
      }
      fail('JPEG 图片缺少尺寸信息。');
    }
    if (mime === 'webp') {
      const word = offset => String.fromCharCode(...bytes.slice(offset, offset + 4));
      if (bytes.length < 25 || word(0) !== 'RIFF' || word(8) !== 'WEBP') fail('WebP 图片头无效。');
      const kind = word(12);
      if (kind === 'VP8X' && bytes.length >= 30) {
        if (bytes[20] & 2) fail('请将动画 WebP 转换为静态图片后导入。');
        return [le24(bytes, 24) + 1, le24(bytes, 27) + 1];
      }
      if (kind === 'VP8 ' && bytes.length >= 30 && bytes[23] === 157 && bytes[24] === 1 && bytes[25] === 42)
        return [(bytes[26] + (bytes[27] << 8)) & 0x3fff, (bytes[28] + (bytes[29] << 8)) & 0x3fff];
      if (kind === 'VP8L' && bytes[20] === 47)
        return [1 + bytes[21] + ((bytes[22] & 63) << 8), 1 + (bytes[22] >> 6) + (bytes[23] << 2) + ((bytes[24] & 15) << 10)];
      fail('不支持的 WebP 图片结构。');
    }
    fail('不支持此图片格式。');
  }
  /* Preflight a raw upload before browser decoding. Returns dimensions, but applies no side limit. */
  function inspectRaster(bytes, mime) {
    if (!(bytes instanceof Uint8Array)) fail('图片字节格式不正确。');
    const type = String(mime || '').replace(/^image\//, '').toLowerCase();
    if (!['png', 'jpeg', 'webp'].includes(type)) fail('仅支持 PNG、JPEG 或 WebP 图片。');
    const size = rasterSize(bytes, type);
    if (!size[0] || !size[1]) fail('图片尺寸无效。');
    return { width: size[0], height: size[1], mime: 'image/' + type };
  }
  function tiffOrientation(bytes, start, length) {
    const end = start + length;
    if (length < 8 || start < 0 || end > bytes.length) return 1;
    const little = bytes[start] === 73 && bytes[start + 1] === 73;
    const big = bytes[start] === 77 && bytes[start + 1] === 77;
    if (!little && !big) return 1;
    const within = (offset, size) => Number.isInteger(offset) && offset >= start && offset <= end - size;
    const short = offset => within(offset, 2) ? (little ? bytes[offset] + bytes[offset + 1] * 256 : bytes[offset] * 256 + bytes[offset + 1]) : null;
    const long = offset => within(offset, 4) ? (little ?
      bytes[offset] + bytes[offset + 1] * 256 + bytes[offset + 2] * 65536 + bytes[offset + 3] * 16777216 : u32(bytes, offset)) : null;
    if (short(start + 2) !== 42) return 1;
    const relative = long(start + 4);
    if (relative === null || relative < 8) return 1;
    const directory = start + relative;
    const count = short(directory);
    if (count === null) return 1;
    for (let index = 0; index < count; index++) {
      const entry = directory + 2 + index * 12;
      if (!within(entry, 12)) break;
      if (short(entry) === 274 && short(entry + 2) === 3 && long(entry + 4) === 1) {
        const orientation = short(entry + 8);
        return orientation >= 1 && orientation <= 8 ? orientation : 1;
      }
    }
    return 1;
  }
  function imageOrientation(bytes, mime) {
    const word = offset => String.fromCharCode(...bytes.slice(offset, offset + 4));
    const exif = (start, length) => {
      if (length >= 6 && String.fromCharCode(...bytes.slice(start, start + 6)) === 'Exif\0\0') return tiffOrientation(bytes, start + 6, length - 6);
      return tiffOrientation(bytes, start, length);
    };
    if (mime === 'jpeg') {
      let offset = 2;
      while (offset + 3 < bytes.length) {
        if (bytes[offset++] !== 255) break;
        while (offset < bytes.length && bytes[offset] === 255) offset++;
        const marker = bytes[offset++];
        if (marker === 217 || marker === 218) break;
        if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
        if (offset + 2 > bytes.length) break;
        const length = bytes[offset] * 256 + bytes[offset + 1];
        if (length < 2 || offset + length > bytes.length) break;
        if (marker === 225 && length >= 8 && String.fromCharCode(...bytes.slice(offset + 2, offset + 8)) === 'Exif\0\0')
          return exif(offset + 2, length - 2);
        offset += length;
      }
    } else if (mime === 'png') {
      let offset = 8;
      while (offset + 12 <= bytes.length) {
        const length = u32(bytes, offset);
        if (length > bytes.length - offset - 12) break;
        if (word(offset + 4) === 'eXIf') return exif(offset + 8, length);
        if (word(offset + 4) === 'IEND') break;
        offset += length + 12;
      }
    } else if (mime === 'webp') {
      let offset = 12;
      const declared = bytes[4] + bytes[5] * 256 + bytes[6] * 65536 + bytes[7] * 16777216 + 8;
      const end = Math.min(bytes.length, declared);
      while (offset + 8 <= end) {
        const length = bytes[offset + 4] + bytes[offset + 5] * 256 + bytes[offset + 6] * 65536 + bytes[offset + 7] * 16777216;
        if (length > end - offset - 8) break;
        if (word(offset) === 'EXIF') return exif(offset + 8, length);
        offset += 8 + length + (length % 2);
      }
    }
    return 1;
  }
  function readImage(value) {
    if (value === null || value === undefined) return { image: null, bytes: 0, width: 0, height: 0 };
    if (typeof value !== 'string' || value.length > Math.ceil(LIMITS.imageBytes / 3) * 4 + 50) fail('单张图片数据不能超过 1 MB，请先缩小图片。');
    const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
    if (!match || match[2].length % 4 !== 0) fail('仅接受本地 PNG、JPEG 或 WebP 图片数据，不能使用 SVG 或外链。');
    const bytes = bytesFromBase64(match[2]);
    if (bytes.length > LIMITS.imageBytes) fail('单张图片数据不能超过 1 MB，请先缩小图片。');
    const size = rasterSize(bytes, match[1]);
    if (!size[0] || !size[1] || size[0] > LIMITS.imageSide || size[1] > LIMITS.imageSide || size[0] * size[1] > LIMITS.imagePixels)
      fail('图片尺寸过大或无效，请缩小到 4096 × 4096 像素以内。');
    const orientation = imageOrientation(bytes, match[1]);
    return { image: value, bytes: bytes.length, width: orientation >= 5 ? size[1] : size[0], height: orientation >= 5 ? size[0] : size[1] };
  }
  function validateImage(value) { return readImage(value).image; }
  /* Display-oriented dimensions (EXIF included), matching Image.naturalWidth/Height. */
  function imageDimensions(value) {
    const info = readImage(value);
    if (!info.image) fail('读取尺寸需要一张有效图片。');
    return { width: info.width, height: info.height };
  }
  function centerCrop(value) {
    const info = readImage(value);
    if (!info.image) fail('裁切需要一张有效图片。');
    const { width, height } = info;
    const size = Math.min(width, height);
    return { x: (width - size) / 2, y: (height - size) / 2, size };
  }
  function normalizeCrop(value, info) {
    if (value === undefined || value === null) return null;
    if (!info.image) fail('没有图片的项目不能设置裁切范围。');
    record(value, '裁切范围', ['x', 'y', 'size']);
    const { x, y, size } = value;
    if (![x, y, size].every(Number.isFinite) || x < 0 || y < 0 || size < 1)
      fail('裁切坐标须为有限数值，起点不能为负，正方形边长至少为 1 像素。');
    const { width, height } = info;
    if (x + size > width || y + size > height) fail('裁切范围不能超出原图边界。');
    return { x, y, size };
  }
  function skinName(value) {
    if (value !== 'classic' && value !== 'tech') fail('不支持此排行皮肤，请选择经典或科技。');
    return value;
  }
  function checkImageBudget(items, replacement) {
    let bytes = 0;
    let pixels = 0;
    const add = entry => {
      let info = itemImages.get(entry);
      if (!info || info.image !== (entry.image == null ? null : entry.image)) { info = readImage(entry.image); itemImages.set(entry, info); }
      bytes += info.bytes;
      pixels += info.width * info.height;
    };
    if (replacement) add(replacement);
    Object.values(items).forEach(entry => { if (!replacement || entry.id !== replacement.id) add(entry); });
    if (bytes > LIMITS.totalImageBytes) fail('所有图片合计不能超过 20 MB，请减少或缩小图片。');
    if (pixels > LIMITS.totalImagePixels) fail('图片解码总量超过 6400 万像素，请缩小图片后导入，以免浏览器内存不足。');
  }
  function normalizeItem(value, itemId, legacy) {
    record(value, '项目', legacy ? ['id', 'name', 'image', 'art'] : ['id', 'name', 'image', 'art', 'crop']);
    if (id(value.id, '项目标识') !== itemId) fail('项目标识与索引不一致。');
    const art = value.art == null ? null : value.art;
    if (art !== null && (typeof art !== 'string' || !own(BUILTIN_ART, art))) fail('未知的示例插画。');
    let info = itemImages.get(value);
    if (!info || info.image !== (value.image == null ? null : value.image)) { info = readImage(value.image); itemImages.set(value, info); }
    const image = info.image;
    if (image && art) fail('项目不能同时含自定义图片和示例插画。');
    const crop = legacy ? null : normalizeCrop(value.crop, info);
    const name = art === 'zhejiang-dry-noodles' && value.name === '（浙江）干挑面' ? FOOD_ART[art].name : value.name;
    const normalized = { id: itemId, name: text(name, LIMITS.name, '项目名称'), image, art, crop };
    itemImages.set(normalized, info);
    return normalized;
  }
  function validateState(value) {
    record(value, '排行');
    if (![1, 2, 3].includes(value.version)) fail('不支持此备份版本。');
    const legacy = value.version === 1;
    record(value, '排行', legacy ? ['version', 'title', 'rows', 'pool', 'items'] :
      value.version === 2 ? ['version', 'title', 'skin', 'rows', 'pool', 'items'] : ['version', 'templateId', 'title', 'skin', 'rows', 'pool', 'items']);
    const templateId = value.version === 3 ? templateFor(value.templateId).id : 'food';
    const skin = legacy ? 'classic' : skinName(value.skin);
    if (!Array.isArray(value.rows) || value.rows.length < 1 || value.rows.length > LIMITS.rows) fail('排行须含 1–' + LIMITS.rows + ' 个等级。');
    record(value.items, '项目索引');
    const itemKeys = Object.keys(value.items);
    if (itemKeys.length > LIMITS.items) fail('项目不能超过 ' + LIMITS.items + ' 个。');
    const items = {};
    itemKeys.forEach(key => {
      id(key, '项目标识');
      items[key] = normalizeItem(value.items[key], key, legacy);
    });
    checkImageBudget(items);
    const rowIds = new Set();
    const referenced = new Set();
    function references(list) {
      if (!Array.isArray(list) || list.length > LIMITS.items) fail('项目列表格式不正确。');
      return list.map(key => {
        if (typeof key !== 'string' || !own(items, key)) fail('等级中引用了不存在的项目。');
        if (referenced.has(key)) fail('同一项目不能重复出现在多个位置。');
        referenced.add(key);
        return key;
      });
    }
    const rows = value.rows.map(row => {
      record(row, '等级', ['id', 'name', 'color', 'itemIds']);
      const rowId = id(row.id, '等级标识');
      if (rowIds.has(rowId)) fail('等级标识不能重复。');
      rowIds.add(rowId);
      return { id: rowId, name: text(row.name, LIMITS.rowName, '等级名称'), color: color(row.color), itemIds: references(row.itemIds) };
    });
    const pool = references(value.pool);
    if (referenced.size !== itemKeys.length) fail('有项目没有归入等级或待选区，备份已拒绝以免丢失内容。');
    return { version: 3, templateId, title: text(value.title, LIMITS.title, '排行标题'), skin, rows, pool, items };
  }
  function serialize(state) { return JSON.stringify(validateState(state), null, 2); }
  function deserialize(json) {
    if (typeof json !== 'string' || json.length > LIMITS.jsonBytes) fail('备份文件过大，最多支持 30 MB。');
    let value;
    try { value = JSON.parse(json); } catch (_) { fail('备份不是有效的 JSON 文件。'); }
    return validateState(value);
  }
  function createDefaultState(templateId = 'food') {
    const template = templateFor(templateId);
    const state = { version: 3, templateId: template.id, title: template.defaultTitle, skin: 'classic', rows: template.rows.map(row => ({
      id: row.id, name: row.name, color: row.color, itemIds: row.artKeys.map(key => template.itemPrefix + '-' + key)
    })), pool: [], items: {} };
    template.rows.forEach(row => row.artKeys.forEach(key => {
      const itemId = template.itemPrefix + '-' + key;
      state.items[itemId] = { id: itemId, name: BUILTIN_ART[key].name, image: null, art: key, crop: null };
    }));
    return state;
  }
  function listFor(state, target) {
    if (target === 'pool') return state.pool;
    const row = state.rows.find(entry => entry.id === target);
    if (!row) fail('目标等级不存在。');
    return row.itemIds;
  }
  function locateItem(state, itemId) {
    if (!own(state.items, itemId)) fail('项目不存在。');
    if (state.pool.includes(itemId)) return { target: 'pool', index: state.pool.indexOf(itemId) };
    const row = state.rows.find(entry => entry.itemIds.includes(itemId));
    if (!row) fail('项目位置无效。');
    return { target: row.id, index: row.itemIds.indexOf(itemId) };
  }
  function position(index, length) {
    if (index === undefined || index === null) return length;
    if (!Number.isInteger(index) || index < 0 || index > length) fail('目标位置超出范围。');
    return index;
  }
  function moveItem(state, itemId, target, index) {
    const source = locateItem(state, itemId);
    const list = listFor(state, target);
    const at = position(index, list.length - (source.target === target ? 1 : 0));
    listFor(state, source.target).splice(source.index, 1);
    list.splice(at, 0, itemId);
    return state;
  }
  function addRow(state, options, index) {
    if (state.rows.length >= LIMITS.rows) fail('最多支持 ' + LIMITS.rows + ' 个等级。');
    const row = { id: makeId('row'), name: text(options.name, LIMITS.rowName, '等级名称'), color: color(options.color || '#c7d7bd'), itemIds: [] };
    state.rows.splice(position(index, state.rows.length), 0, row);
    return row.id;
  }
  function deleteRow(state, rowId) {
    const index = state.rows.findIndex(row => row.id === rowId);
    if (index < 0) fail('等级不存在。');
    if (state.rows.length <= 1) fail('至少保留一个等级。');
    state.pool.push(...state.rows[index].itemIds);
    state.rows.splice(index, 1);
    return state;
  }
  function reorderRow(state, rowId, index) {
    const from = state.rows.findIndex(row => row.id === rowId);
    if (from < 0) fail('等级不存在。');
    const at = position(index, state.rows.length - 1);
    state.rows.splice(at, 0, state.rows.splice(from, 1)[0]);
    return state;
  }
  function updateRow(state, rowId, patch) {
    const row = state.rows.find(entry => entry.id === rowId);
    if (!row) fail('等级不存在。');
    record(patch, '等级修改', ['name', 'color']);
    const nextName = own(patch, 'name') ? text(patch.name, LIMITS.rowName, '等级名称') : row.name;
    const nextColor = own(patch, 'color') ? color(patch.color) : row.color;
    row.name = nextName; row.color = nextColor;
    return state;
  }
  function addItem(state, options, target) {
    if (Object.keys(state.items).length >= LIMITS.items) fail('最多支持 ' + LIMITS.items + ' 个项目。');
    record(options, '新项目', ['name', 'image', 'art', 'crop']);
    const itemId = makeId('item');
    const item = normalizeItem({ id: itemId, name: options.name, image: options.image, art: options.art, crop: options.crop }, itemId);
    checkImageBudget(state.items, item);
    const destination = listFor(state, target || 'pool');
    state.items[itemId] = item; destination.push(itemId);
    return itemId;
  }
  function updateItem(state, itemId, patch) {
    if (!own(state.items, itemId)) fail('项目不存在。');
    record(patch, '项目修改', ['name', 'image', 'art', 'crop']);
    if (own(patch, 'image') && patch.image !== state.items[itemId].image && (!own(patch, 'crop') || patch.crop === undefined))
      fail('替换图片时须明确指定裁切范围；保留整图请设置 crop 为 null。');
    const item = normalizeItem(Object.assign({}, state.items[itemId], patch), itemId);
    checkImageBudget(state.items, item);
    state.items[itemId] = item;
    return state;
  }
  function removeItem(state, itemId) {
    const source = locateItem(state, itemId);
    listFor(state, source.target).splice(source.index, 1);
    delete state.items[itemId];
    return state;
  }
  function setTitle(state, value) { state.title = text(value, LIMITS.title, '排行标题'); return state; }
  function setSkin(state, value) { state.skin = skinName(value); return state; }
  function clearItems(state) {
    state.rows.forEach(row => { row.itemIds = []; });
    state.pool = [];
    state.items = {};
    return state;
  }

  // Language is a view preference. None of these helpers serialize or mutate rankings.
  const UI_KEYS = {"名著排行":"games.template.book","默认按英文原版的阅读体验随手排一排，只是娱乐，不是文学评价。":"games.book.note","跳转到正文":"games.ui.3bdd78610ae4","谢雨卿个人主页":"games.ui.23a537ad041b","谢雨卿":"games.ui.dc98b7e75103","谢雨卿 · Carl":"games.ui.208a9a2c6d6b","主导航":"games.ui.9bae68040509","切换到深色模式":"games.ui.fba8f91e79af","深色":"games.ui.a6b75d068032","A LITTLE PLAY · 小游戏":"games.ui.620e64be66df","来玩一会儿。":"games.ui.b47f78799915","把好奇心变成一点小乐趣。":"games.ui.2a8e5d9fddb5","在阅读与写作之间，给自己留一个轻松的角落。":"games.ui.71d4d2eb5fee","夯":"games.ui.65e7e31bff10","顶级":"games.ui.457b73ae91bf","人上人":"games.ui.2ad2879fb038","NPC":"games.ui.f2d1dab08310","拉完了":"games.ui.7165ed1aa43b","01 / 自由排行":"games.ui.33076220529a","从夯到拉":"games.ui.89098fd3df63","供大家娱乐，也欢迎制作自己的「从夯到拉」排行榜，自由添加图片、调整等级，并下载、保存和展示。":"games.ui.d7726db07581","自由修改等级，添加文字或图片":"games.ui.500a96641869","拖拽或点选排列，手机也能玩":"games.ui.480bf21e2fa4","下载清晰榜单，留住这一刻的偏好":"games.ui.f4a63e6f5e1e","打开排行工具":"games.ui.ab106bdb28bb","先看示例，点「制作我的榜单」即可编辑。无需登录，图片仅在浏览器本地处理。":"games.ui.9da9f8c04611","这里的排行榜只表达个人偏好，默认美食示例仅供演示。":"games.ui.2bd32c97a30e","← 小游戏":"games.ui.3d9f6b4bf33f","A LITTLE OPINION · 一点个人偏好":"games.ui.d29b624582ab","没有标准答案，":"games.ui.7a355a59436f","只有你的排序。":"games.ui.711b7cad075f","此工具需要 JavaScript 才能编辑和导出；所有图片仅在你的浏览器中处理。":"games.ui.cdddfb20f147","返回小游戏":"games.ui.5978c1b0cef2","下载 PNG":"games.ui.0f34f762bdf6","清晰度":"games.ui.0e22652107f5","标准 1×":"games.ui.a9e08f73bba3","高清 2×":"games.ui.5053907fcd13","排行皮肤":"games.ui.ac06711e492a","经典款":"games.ui.77d7be2fdd1b","科技版":"games.ui.b1c1eef283a0","清空全部项目":"games.ui.6b7bbbc0b0ef","模板":"games.ui.62b95daecb7f","选择排行模板":"games.ui.4d2ea897c652","恢复默认美食排行":"games.ui.0a77076cb43d","恢复默认运动排行":"games.ui.93ea070cd5a2","撤销清空":"games.ui.32d9372cf721","撤销切换模板":"games.ui.0b8e23d8ab94","撤销恢复默认":"games.ui.6538c02e263b","制作我的榜单":"games.ui.ec19607384c4","制作我的榜单，退出展示并进入编辑模式":"games.ui.60bd30b56c90","制作我的榜单，也可按 Esc 进入编辑":"games.ui.2201796fa017","正在恢复本地存档…":"games.ui.fa6d3e934c9e","排行榜查看大小与全屏":"games.ui.90833d57a20e","缩小排行榜":"games.ui.8718ecfe2f90","放大排行榜":"games.ui.d3614089134c","还原":"games.ui.ddde08946298","适应宽度":"games.ui.ac11eac9162f","拖动排序":"games.ui.a8036485f922","结束拖动":"games.ui.10158cdf5fcb","仅看榜单":"games.ui.2c401dd85502","显示待选区":"games.ui.81d00b285f17","全屏查看":"games.ui.11423aad226b","退出大屏":"games.ui.33ce80b960f9","退出全屏":"games.ui.0f1505b6ad3f","滑动浏览；开启「拖动排序」后可移动卡片。":"games.ui.0e21f59bd47d","拖动已开启；点「结束拖动」即可恢复滑动浏览。":"games.ui.9abebd619091","经典款为清晰表格，科技款为现代卡片，两款都随站点明暗变化。图片可从电脑直接拖到等级或待选区，点开项目可换图、缩放和裁切。":"games.ui.47927c28ce63","排行榜滚动查看区域":"games.ui.f641949e8b7a","排行榜":"games.ui.1ee95aa94712","排行榜标题 · 点击修改":"games.ui.8c6307a66523","排行榜标题":"games.ui.d4519f664a2d","展示时双击卡片编辑；手机默认滑动浏览，开启「拖动排序」后可整卡移动。编辑时单击卡片选级或改图，也可用拖动柄排序。放大后可在榜单区域横向或纵向滑动。电脑图片可直接拖入等级。每行「设置」可改名、换色和排序。":"games.ui.3c71e90c8b07","＋ 添加等级":"games.ui.045f13f62ae4","待选区":"games.ui.a5628ffa9e77","还没想好，先放这里":"games.ui.1c191e065271","新项目名称":"games.ui.3f9525ffd25a","添加一个文字项目":"games.ui.ee06270b7e1a","添加文字项目":"games.ui.c2c26c7a2c4e","＋ 导入本地图片（可多选）":"games.ui.6a8f0e83e4bd","拖入或选择 PNG / JPG / WebP，每张 ≤ 10 MB。保留缩放原图，可再次裁切，仅本地处理。":"games.ui.fc938fda17c1","待选项目":"games.ui.8d78f1a107e4","示例仅供个人演示，不代表权威评价。":"games.ui.5b7b96bba528","运动示例仅为个人偏好，不构成健康或训练建议。":"games.ui.dc05f6747ecd","备份与使用说明":"games.ui.09b0809171a6","各模板分别保留内容；切换前确认，恢复默认只作用于当前模板。修改自动保存在当前浏览器中。清理网站数据或更换设备会丢失本地存档，重要排行请导出 JSON 备份。多标签页以最后保存为准。":"games.ui.d6effd2dcc8f","导出 JSON":"games.ui.fb48367b485c","导入 JSON":"games.ui.8f6e8682a3f0","键盘：Tab 选中卡片，Enter 或空格打开编辑，选择等级后保存；也可用「向前 / 向后」调整同级顺序。展示时：双击或双点卡片编辑；手机默认滑动浏览，开启「拖动排序」后可整卡移动，再点「结束拖动」恢复滚动。电脑可直接拖动整张卡片。编辑时：单击卡片编辑，触屏按右上角拖动柄移动。默认进入展示模式，点「制作我的榜单」或按 Esc 进入完整编辑；「返回小游戏」可回到入口页。":"games.ui.123cca15193f","PNG 只导出标题、所有等级和已归级项目，不包含待选区与编辑按钮；长名称与长列表自动换行。特别长的榜单会自动降低输出倍率，超过安全尺寸会提示拆分。":"games.ui.8a438e3c3a92","编辑项目":"games.ui.577feeefb88d","取消并关闭项目编辑":"games.ui.e3e0fcc748e6","项目名称":"games.ui.867698fb7b0c","项目图片与裁切":"games.ui.e3684ce39d78","图片预览 · 正方形裁切":"games.ui.ff7d974a348b","裁切预览，可拖动定位；方向键微调，Shift加速":"games.ui.39127f38534d","添加图片后可拖动定位和缩放。":"games.ui.c5ba2d83c541","缩放":"games.ui.b762aec769a3","添加 / 更换图片":"games.ui.b395de1e378e","重置裁切":"games.ui.0ca833d84531","移除图片":"games.ui.86d72aaba84d","原图会缩放保留；拖动、方向键或缩放调整裁切，保存后生效。取消不改原项目。":"games.ui.8f857875f166","放到哪里":"games.ui.06207433a63c","在当前等级内排序":"games.ui.394ac5d94729","向前":"games.ui.c0fe0d7bbc37","向后":"games.ui.7d506bd0c8d2","删除项目":"games.ui.f6dc6a110d09","取消":"games.ui.2cd0f3be8738","保存并移动":"games.ui.b397a77d3d9e","排序、名称、图片和等级一起保存；删除项目需要确认。":"games.ui.bf1e62542e79","等级设置":"games.ui.47eaab71b52a","关闭等级设置":"games.ui.70c1933d1c87","等级名称":"games.ui.26e5302ace70","标签颜色":"games.ui.f5511e8aa25a","调整等级位置":"games.ui.248d4fe7b6f3","上移":"games.ui.f853a70b1204","下移":"games.ui.e75e8b4e5c97","删除等级":"games.ui.71128bd3f56f","保存等级":"games.ui.5d78ab37073f","删除等级后，其中的项目会回到待选区。":"games.ui.8cbb0cf0a2ec","操作未完成，请重试或导出 JSON 备份。":"games.ui.0c172fbd3f97","图片编辑未完成，请重试。":"games.ui.0f122683346c","原存档受保护，请先导出备份或确认重置":"games.ui.1db9561ce8e1","正在保存…":"games.ui.6bdb4435095e","已自动保存到本机":"games.ui.6c663b040771","自动保存失败 · 请导出 JSON":"games.ui.f3d8af469bb8","编辑或移动：{name}":"games.ui.1ec6e990ad4d","拖动项目（触屏按住此处）":"games.ui.53b9069da34a","拖动或编辑：{name}":"games.ui.6e388a8b8a2a","删除项目：{name}":"games.ui.e33978a8bbe2","设置":"games.ui.df3d58c7d84b","设置等级：{name}":"games.ui.eb579e229a67","{name}级项目":"games.ui.131dba34accc","恢复默认{template}":"games.ui.da1a3d59e217","美食排行":"games.ui.1dca6a85fa34","运动排行":"games.ui.7901b5a4130c","第 {position} / {total} 项 · 保存后生效":"games.ui.df23d37cce9e","添加等级":"games.ui.ef75ff3c4186","删除这个项目？此操作无法撤销。":"games.ui.fe408a66ad0d","项目已删除。":"games.ui.abe2bf65cdad","请填写项目名称。":"games.ui.ce12a47f2ebf","项目已更新。":"games.ui.ec4f53defee8","等级已保存。":"games.ui.717b4b8e69df","等级顺序已调整。":"games.ui.0886b3c4a32d","等级已删除，其中的项目已回到待选区。":"games.ui.0cfdc742c8d7","文字项目已加入待选区。":"games.ui.c7d055843d38","标题不能为空，已恢复上次标题。":"games.ui.04c0dfbad459","当前浏览器暂不支持文件下载，请使用支持下载的浏览器。榜单仍保留在此页面。":"games.ui.99ef266068d6","我的排行":"games.ui.4485dd16fa46","正在生成 PNG，请稍候…":"games.ui.5f2ce615f851","PNG 已生成（{width} × {height} 像素{adjusted}）。":"games.ui.761996c16c93","，已为长图自动降低倍率":"games.ui.63c9380e5b0e","JSON 备份已生成，包含自定义图片与全部项目。":"games.ui.13a88880e7dd","备份文件过大，最多支持 30 MB。":"games.ui.6c62ceeca8c6","导入“{template}”备份？将替换此模板的内容，其他模板内容保留。请先导出 JSON 备份。":"games.ui.f0d962a2f043","备份已导入。":"games.ui.3e340163415b","恢复默认{template}？只替换当前模板的标题、等级和项目，皮肤与主题选择保留。继续编辑前可撤销；需要留档请先导出 JSON 备份。":"games.ui.f817a323db19","已恢复默认{template}。继续编辑前可撤销恢复。":"games.ui.7b41bdbe24dc","清空全部项目（含待选区）？标题和等级会保留，本页继续编辑前可撤销。":"games.ui.5983781671cd","全部项目已清空。继续编辑前，可点「撤销清空」恢复。":"games.ui.33079aa7f27f","已撤销切换，原模板内容已还原。":"games.ui.027c37a46bd6","已撤销恢复默认，原有排行和图片已还原。":"games.ui.d9b8fed8a4e2","已恢复清空前的全部项目。":"games.ui.790b29c95321","切换到“{template}”？当前模板内容将分别保留，可切回继续，也可在继续编辑前撤销切换。重要内容建议先导出 JSON 备份。":"games.ui.9c68b42e13fa","“{template}”存档无法读取。是否只恢复该模板默认？将替换这份损坏记录，当前模板内容保留；取消则不更改。":"games.ui.09e03d2fb721","本地存储不可用，本次模板内容仅在当前页面保留，请导出 JSON 备份。":"games.ui.b196a467e30a","离开模板前保存失败，本次内容已保留在当前页面，请导出 JSON 备份。":"games.ui.c103cd38473a","原存档仍受保护，切换内容暂存当前页面。请导出 JSON 备份，确认恢复默认或导入备份后再覆盖保存。":"games.ui.00a485f8f111","已切换到{template}；各模板内容分别保留，继续编辑前可撤销切换。":"games.ui.549b87dab32d","已切换排行皮肤，站点明暗主题不变。":"games.ui.746397fe8ef5","展示模式":"games.ui.b64c8b5f35d4","进入展示模式，隐藏编辑控件":"games.ui.6186491a3299","进入展示模式":"games.ui.ddfb6e13a4bd","请先保存或取消当前编辑，再拖入新项目；换图请使用「添加 / 更换图片」。":"games.ui.ce76291c99a5","项目总数最多 {count} 个，请减少本次选择。":"games.ui.aa74b4843a5f","正在处理图片 {current} / {total}…":"games.ui.39379fc58602","已将 {count} 张图片导入{destination}。{detail}":"games.ui.a13a70509edf"," {count} 个文件未导入：{errors}{extra}":"games.ui.b349dc0ac924","；其余失败文件请检查类型和大小。":"games.ui.fc1590ed9caf","{name}等级":"games.ui.15198a2c3ae0","项目已移动。":"games.ui.d19203aacc95","已恢复本机排行":"games.ui.93bc95423b38","修改后自动保存到本机":"games.ui.026e972a8702","无法恢复存档 · 请备份":"games.ui.9d2b811df9df","待选区还有 {count} 项，点「显示待选区」可恢复查看。":"games.ui.b8ca7c9f86d5","暂时无法退出原生全屏，请按 Esc 或使用浏览器的退出全屏操作。":"games.ui.4ca2a227793f","当前浏览器使用页面内大屏。点「退出大屏」或按 Esc 返回。":"games.ui.e260d568d627","浏览器未进入原生全屏，已使用页面内大屏。点「退出大屏」或按 Esc 返回。":"games.ui.485b088af793","已进入全屏，点「退出全屏」或按 Esc 返回。":"games.ui.d5593a292015","浏览器未允许原生全屏，已使用页面内大屏。点「退出大屏」或按 Esc 返回。":"games.ui.bc202547282f","查看模式切换未完成，请重试。":"games.ui.98883ceae121","拖到这里 / 点击卡片选级":"games.ui.5414d6def815","全部排好啦，也可以再加一些。":"games.ui.9e8926c4f4f1","浏览器本地存储空间不足，本次修改尚未自动保存。请先导出 JSON 备份，再减少图片。":"games.ui.8a1e59a4b204","此浏览器未允许本地保存。修改仍可使用，请及时导出 JSON 备份。":"games.ui.f505fda7e004","本地保存未完成，请导出 JSON 备份后重试。":"games.ui.d1cc8fcf95bd","未知排行模板，原存档仍保留，请刷新页面后重试。":"games.ui.bd9b381fcb33","此浏览器无法使用本地自动保存，请使用 JSON 文件备份。":"games.ui.6a8e85b99973","打开本地存储超时，请关闭旧标签页后重试，或导出 JSON 备份。":"games.ui.9578033798ba","本地存储被旧标签页占用，请关闭旧页面后重试或导出 JSON 备份。":"games.ui.92e7487abe9b","已保存的排行无法读取，原记录仍保留。可导入其他 JSON 备份，或确认重置。{detail}":"games.ui.12ec1cc0fde5","模板标识与存档位置不一致。":"games.ui.34e25379341e","此模板存档无法读取，原记录仍保留，未自动覆盖。请导出 JSON 备份，或确认重置此模板。{detail}":"games.ui.76e267c843d1","未知的排行模板，请选择美食排行、运动排行或名著排行。":"games.ui.3037ca0f4de0","{label}格式不正确。":"games.ui.1585111c21fe","{label}包含不支持的字段。":"games.ui.50b0b6c15c72","{label}必须是文字。":"games.ui.352aa197212e","{label}须为 1–{count} 个字符，且不能含控制字符。":"games.ui.d3eebd629da1","{label}不合法。":"games.ui.d0827bc783e1","等级颜色须为六位十六进制颜色。":"games.ui.416d2a7e8296","此浏览器无法读取图片数据。":"games.ui.d81e75841dc5","PNG 图片头无效。":"games.ui.31c1f41c34b7","JPEG 图片头无效。":"games.ui.b14d59db78d0","JPEG 图片结构无效。":"games.ui.5ff0938fc1a0","JPEG 图片尺寸无效。":"games.ui.93691ac4ba46","JPEG 图片缺少尺寸信息。":"games.ui.822d5d2820ba","WebP 图片头无效。":"games.ui.07c59bf3a279","请将动画 WebP 转换为静态图片后导入。":"games.ui.aadac185fc70","不支持的 WebP 图片结构。":"games.ui.0998ea2c2fea","不支持此图片格式。":"games.ui.1f3133723bd8","图片字节格式不正确。":"games.ui.eac614cac5f2","仅支持 PNG、JPEG 或 WebP 图片。":"games.ui.5eb4b04df802","图片尺寸无效。":"games.ui.f88a4d304e05","单张图片数据不能超过 1 MB，请先缩小图片。":"games.ui.904765c2fce9","仅接受本地 PNG、JPEG 或 WebP 图片数据，不能使用 SVG 或外链。":"games.ui.97523f2eccc6","图片尺寸过大或无效，请缩小到 4096 × 4096 像素以内。":"games.ui.671049c9d51e","读取尺寸需要一张有效图片。":"games.ui.0ce9d9299d1e","裁切需要一张有效图片。":"games.ui.6c5fc62b3a1e","没有图片的项目不能设置裁切范围。":"games.ui.957f50d671d1","裁切坐标须为有限数值，起点不能为负，正方形边长至少为 1 像素。":"games.ui.466939e9da15","裁切范围不能超出原图边界。":"games.ui.765ca864bb35","不支持此排行皮肤，请选择经典或科技。":"games.ui.8543250a060a","所有图片合计不能超过 20 MB，请减少或缩小图片。":"games.ui.0717f83867b6","图片解码总量超过 6400 万像素，请缩小图片后导入，以免浏览器内存不足。":"games.ui.71966f1bb2bc","项目标识与索引不一致。":"games.ui.0915b1c74b4a","未知的示例插画。":"games.ui.44a14d67bdec","项目不能同时含自定义图片和示例插画。":"games.ui.0111f4e3807e","不支持此备份版本。":"games.ui.db455a0e2ef3","排行须含 1–{count} 个等级。":"games.ui.4c7ec49962ac","项目不能超过 {count} 个。":"games.ui.09e28572e679","项目列表格式不正确。":"games.ui.d7cce6459657","等级中引用了不存在的项目。":"games.ui.9ff18ab71772","同一项目不能重复出现在多个位置。":"games.ui.116df8f1647e","等级标识不能重复。":"games.ui.b6941b9a3733","有项目没有归入等级或待选区，备份已拒绝以免丢失内容。":"games.ui.dc380faf02bb","备份不是有效的 JSON 文件。":"games.ui.ecbc66909463","目标等级不存在。":"games.ui.ea9d209ae427","项目不存在。":"games.ui.e1da3f27466b","项目位置无效。":"games.ui.9def5f634559","目标位置超出范围。":"games.ui.aaa3e10089d9","最多支持 {count} 个等级。":"games.ui.72b76d98e28d","等级不存在。":"games.ui.cb8cf31a2af9","至少保留一个等级。":"games.ui.122c0d944297","最多支持 {count} 个项目。":"games.ui.55839b0c2cf3","替换图片时须明确指定裁切范围；保留整图请设置 crop 为 null。":"games.ui.3ee6f8610df9","标识":"games.ui.301c9461c1d0","裁切范围":"games.ui.ae2061728637","项目":"games.ui.79f326be4409","项目标识":"games.ui.9c22d9174163","排行":"games.ui.f70136801523","项目索引":"games.ui.f054c34f0257","等级":"games.ui.337717173807","等级标识":"games.ui.ea586aca9da4","排行标题":"games.ui.46482146482e","等级修改":"games.ui.502bdbfe7292","新项目":"games.ui.af1ffad8bb2f","项目修改":"games.ui.7f07172af5f4","导出布局宽度须在 640–2000 像素之间。":"games.ui.c50f70793918","导出清晰度须在 0.5–4 倍之间。":"games.ui.a79a4bf236da","排行过长，无法在安全内存范围内导出清晰图片。请缩短名称或减少项目后重试。":"games.ui.d3da2aa5526a","“{name}”的内置照片无法读取，请刷新页面或检查本地资源后重试。":"games.ui.04b07c398f99","“{name}”的图片无法读取，请重新导入该图片。":"games.ui.80188ab33ed3","“{name}”的图片读取超时，请重新导入后再试。":"games.ui.f52ed500c958","“{name}”的图片解码超时。":"games.ui.ff70f907d2dc","“{name}”的图片尺寸无效。":"games.ui.d26801e34d48","“{name}”的图片解码失败，请重新导入该图片。":"games.ui.60e975b19b03","PNG 导出需要支持 Canvas 的浏览器。":"games.ui.cfbf0d23200a","等待字体超时，请稍后重试 PNG 导出。":"games.ui.0d45ec1c42c3","此浏览器无法创建图片画布，请尝试更新浏览器或导出 JSON 备份。":"games.ui.9c6e53b66898","当前浏览器暂不支持 PNG 编码。请先导出 JSON 备份，或使用更新的浏览器。":"games.ui.21044bcd0c93","PNG 编码失败，请降低清晰度后重试。":"games.ui.9c582691f0bb","PNG 导出失败，图片可能无法被浏览器读取。请重新导入图片或导出 JSON 备份。":"games.ui.59b52bbf1dd0","PNG 编码超时，请降低清晰度或减少项目后重试。":"games.ui.015319e3bcc0","内置图片路径无效，请刷新页面或选择本地图片。":"games.ui.1cd15ecd8331","图片读取已取消。":"games.ui.307b5d5cc2d3","内置图片读取失败（HTTP {status}），请刷新页面重试或选择本地图片。":"games.ui.eb0c54c130bf","内置图片超过 10 MB，无法编辑。":"games.ui.7a1110e80f0f","内置图片为空或超过 10 MB，无法编辑。":"games.ui.b537ab8feb06","图片读取超时，请换一张图片。":"games.ui.ca08f4df4bc8","图片损坏或浏览器无法读取，请使用 PNG、JPEG 或静态 WebP。":"games.ui.27e41c7e75c0","图片解码失败，请换一张图片。":"games.ui.e73f12cf11b7","图片校验模块未加载，请刷新页面。":"games.ui.b16e1b643d8f","只支持 PNG、JPG、静态 WebP，不接收 SVG 或其他文件。":"games.ui.6471b1254095","图片须大于 0 且不超过 10 MB，请先缩小原图。":"games.ui.4d5b6f9fd676","原图尺寸过大，请缩小到 3200 万像素以内，且单边不超过 12000 像素。":"games.ui.90709f904e37","解码后的图片尺寸过大，请先缩小原图。":"games.ui.1b93c29bffb7","浏览器无法处理图片，请换一个浏览器重试。":"games.ui.b155f1a2dbeb","压缩后的图片仍超过 1 MB，请先缩小或简化原图。":"games.ui.b4c6be46858d","图片处理失败，请换一张图片。":"games.ui.0f93b526975e","图片编辑器缺少必要控件。":"games.ui.1a8a5775577b","浏览器无法打开图片编辑器。":"games.ui.166a38a85bcf","图片裁切预览：拖动图片定位，方向键微调，Shift 加速；使用缩放滑块放大。":"games.ui.a2744f095ac2","图片处理失败，请重试。":"games.ui.f0713bc6698e","正在读取照片":"games.ui.bc7c663bcaa8","图片":"games.ui.d24c10d37db0","示例插画；可选择本地图片替换。":"games.ui.ef445215b9fb","暂无图片；选择本地图片后可拖动定位和缩放。":"games.ui.af389a1f0e8a","当前完整显示，尚未裁切。拖动、缩放或重置后应用正方形裁切。":"games.ui.684c69cc4d2d","正方形裁切 · 拖动定位，方向键微调，Shift 加速。保存后应用，取消不改原项目。":"games.ui.3e0c3d839ce8","正在读取图片…":"games.ui.0ecc16e7fa2c","内置图片读取超时，请刷新重试或选择本地图片。":"games.ui.116c33f6b7b9","图片仍在读取或读取失败，请稍后保存，或替换、移除图片。":"games.ui.423f3e3f9575","正在处理本地图片…":"games.ui.72dc20329602","图片处理超时，请先缩小原图后重试。":"games.ui.706f7262a853","谢":"games.ui.70883efd8bca"};
  const UI_PATTERNS = Object.keys(UI_KEYS).filter(source => /\{\w+\}/.test(source)).map(source => {
    const names = []; let previous = 0, pattern = '^';
    const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (const match of source.matchAll(/\{(\w+)\}/g)) {
      pattern += escape(source.slice(previous, match.index)) + '([\\s\\S]*?)'; names.push(match[1]); previous = match.index + match[0].length;
    }
    return {source, names, pattern: new RegExp(pattern + escape(source.slice(previous)) + '$')};
  }).sort((a,b) => b.source.replace(/\{\w+\}/g,'').length - a.source.replace(/\{\w+\}/g,'').length);
  function uiLanguage() { return globalThis.SiteI18n?.lang?.() || 'zh-CN'; }
  function translate(source, values = {}) {
    const fallback = String(source).replace(/\{(\w+)\}/g, (all,key) => Object.prototype.hasOwnProperty.call(values,key) ? String(values[key]) : all);
    return UI_KEYS[source] && globalThis.SiteI18n?.t ? globalThis.SiteI18n.t(UI_KEYS[source], values, fallback) : fallback;
  }
  function localize(source, depth = 0) {
    source = String(source ?? '');
    if (UI_KEYS[source]) return translate(source);
    if (depth > 4) return source;
    for (const entry of UI_PATTERNS) {
      const match = entry.pattern.exec(source); if (!match) continue;
      const values = Object.fromEntries(entry.names.map((name,index) => [name, match[index+1]]));
      for (const name of ['label','template','detail','adjusted','extra','destination']) if (values[name]) values[name] = localize(values[name],depth+1);
      return translate(entry.source,values);
    }
    return source;
  }
  const uiBindings = new Map(), displayInputs = new Map();
  const DEFAULT_ITEM_ART = Object.freeze(Object.fromEntries([
    ...Object.keys(FOOD_ART).map(key=>['food-'+key,key]),
    ...Object.keys(SPORT_ART).map(key=>['sport-'+key,key]),
    ...Object.keys(BOOK_ART).map(key=>['book-'+key,key])
  ]));
  function uiText(element, source) {
    if (!element) return;
    const record = uiBindings.get(element) || {}; record.text = source; uiBindings.set(element,record);
    element.textContent = localize(typeof source === 'function' ? source() : source);
  }
  function uiAttr(element, attribute, source) {
    if (!element) return;
    const record = uiBindings.get(element) || {}; record.attrs ||= {}; record.attrs[attribute] = source; uiBindings.set(element,record);
    element.setAttribute(attribute,localize(typeof source === 'function' ? source() : source));
  }
  function templateNote(templateId) { return templateFor(templateId).note; }
  function displayArtAlt(artKey) {
    const art = own(BUILTIN_ART,artKey) && BUILTIN_ART[artKey];
    return art ? art[uiLanguage() === 'en' ? 'alt_en' : 'alt_zh'] || '' : '';
  }
  function displayItemName(item) {
    // A new custom ID is user content even if its name and art match an example.
    const identity = DEFAULT_ITEM_ART[item.id], art = identity && (!item.art || item.art === identity) ? identity : null;
    const original = art && BUILTIN_ART[art];
    return original && item.name === original.name && globalThis.SiteI18n?.t ? globalThis.SiteI18n.t('games.item.'+art,{},item.name) : item.name;
  }
  function displayRowName(row,state) {
    const template = TEMPLATES[state.templateId], index = template?.rows.findIndex(entry => entry.id === row.id && entry.name === row.name);
    return index >= 0 && globalThis.SiteI18n?.t ? globalThis.SiteI18n.t('games.tier.'+index,{},row.name) : row.name;
  }
  function displayTitle(state) {
    return state.title === TEMPLATES[state.templateId]?.defaultTitle && globalThis.SiteI18n?.t ? globalThis.SiteI18n.t('games.title.'+state.templateId,{},state.title) : state.title;
  }
  function displayState(input) {
    const state = validateState(input); state.title = displayTitle(state);
    state.rows.forEach(row => { row.name = displayRowName(row,state); });
    Object.values(state.items).forEach(item => { item.name = displayItemName(item); });
    return state;
  }
  function bindDisplayInput(element, raw, getter) {
    const shown = getter(); element.value = shown; displayInputs.set(element,{raw,shown,getter});
  }
  function inputValue(element) {
    const record = displayInputs.get(element);
    return record && element.value.trim() === record.shown.trim() ? record.raw : element.value.trim();
  }
  function refreshLanguageBindings() {
    for (const [element,record] of uiBindings) {
      if (element.isConnected === false) { uiBindings.delete(element); continue; }
      if (Object.prototype.hasOwnProperty.call(record,'text')) element.textContent = localize(typeof record.text === 'function' ? record.text() : record.text);
      for (const [attribute,source] of Object.entries(record.attrs || {})) element.setAttribute(attribute,localize(typeof source === 'function' ? source() : source));
    }
    for (const [element,record] of displayInputs) {
      if (element.isConnected === false) { displayInputs.delete(element); continue; }
      // Focused or changed inputs are drafts, even while a language switch is in flight.
      if (typeof document !== 'undefined' && document.activeElement !== element && element.value === record.shown) { record.shown = record.getter(); element.value = record.shown; }
    }
  }
  globalThis.SiteI18n?.onChange?.(refreshLanguageBindings);

  return { translate, localize, uiText, uiAttr, displayItemName, displayRowName, displayTitle, displayState, bindDisplayInput, inputValue, refreshLanguageBindings, LIMITS, FOOD_ART, SPORT_ART, BOOK_ART, BUILTIN_ART, TEMPLATES, templateNote, displayArtAlt, createDefaultState, validateState, validateImage, inspectRaster, imageDimensions, centerCrop, serialize, deserialize,
    moveItem, locateItem, addRow, deleteRow, reorderRow, updateRow, addItem, updateItem, removeItem, setTitle, setSkin, clearItems };
}));
