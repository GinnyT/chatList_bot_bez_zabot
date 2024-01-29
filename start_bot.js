require('dotenv').config({ path: `${process.env.NODE_ENV}.env` });

//const Chat = require('./chat_data');          //данные в Global
const DATA = require('./chat_data_in_files'); //данные в файле
const { Telegraf } = require('telegraf');
const { message } = require('telegraf/filters');
//@TODO: не нашел простой способ вызвать единожды асинхронную функцию getMe() так, чтобы получить актуальное имя бота, но не грузить запросом каждый вызов внутри use. пока решил зашить в окружение
const bot = new Telegraf(process.env.TOKEN);
console.log('Стартует бот: ',process.env.BOT_NAME)

//глобальные переменные и константы
//@TODO: рефакторить - вынести в хелперы
let counter = 0;
let data = {};

let CHAT_NAME = 'Список';
const LIST_BTN = {inline_keyboard: [[{text: CHAT_NAME, callback_data: 'list'}]]};
const HELP_BTN = {inline_keyboard: [[{text: "помощь", callback_data: 'help'}]]};
const LIST_N_HELP_BTN = {inline_keyboard: [[LIST_BTN.inline_keyboard[0][0], HELP_BTN.inline_keyboard[0][0]]]}
const LOAD_EMJ = '...\u{1F90C}...';
const EMPTY_LIST_MES = '</b>: <i>пока пусто...</i>🤷‍♂️ запиши что-нибудь в свой список:';

// HELPERs
const escapeHtml = (unsafe) => {
  return unsafe.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
};
const escapeAfew = (text) => {
  ['<','>'].forEach(char => (text = text.replaceAll(char, '\\'+char)));
  return text;
};


//оболочка обработки каждого сообщения
bot.use(async (ctx, next) => {

  const start_time = new Date();
  //const getMe = await bot.telegram.getMe((res)=>{return res});
  //console.log('Bot GetMe=\n',JSON.stringify(getMe,null,1));

  console.log(`---------------\n${counter++}) прилетело из чата: ${ctx.chat?.id} от ${ctx.from.username} тип: ${ctx.updateType}`);
  
  if (ctx.updateType === 'inline_query') {
    console.warn('inline_query (не обрабатывается)=\n',JSON.stringify(ctx.inlineQuery,null,1));
  //
  } else {
    data = await DATA.init(ctx.chat?.id);
    CHAT_NAME = data.list_name.name;
    //
    await next();
    await data.update();
  };
  const ms = new Date() - start_time;
  console.log(`---------------время обработки: ${ms}`);
});

//                  ВВОДИМЫЕ КОМАНДЫ
bot.telegram.setMyCommands([
  {
    command: 'help',
    description: 'помочь? 🤔',
  },
  {
    command: 'list',
    description: 'показать список 💬',
  },
  { 
    command: 'print',
    description: 'вывести список на "печать" в сообщение 🖨',
  },
  /* {
    command: 'clear',
    description: 'очистить список 📛',
  }, */
  {
    command: 'settings',
    description: 'настройки ⚙',
  },
], /* {scope: {type: 'all_private_chats'}}, 'ru' */);


// команда на старт
bot.command('start', async (ctx) => {
  console.log('ввел команду "/start"');
  data.wait_for_name(false);
  kill_panel(ctx);
  await ctx.reply('Привет! Помочь или сразу к делу? 👇✍', {reply_to_message_id: ctx.message?.message_id} )
  .catch(err=>console.error(err));

  const {message_id} = await ctx.reply('...');
  data.set_last_list_message_id(message_id);
  show_list(ctx, message_id, 0, 'старый список найден! С возвращением! 😘');
});

// показать список 
bot.command('list', async (ctx) => {
  console.log('ввел команду "/list"');
  data.wait_for_name(false);
  kill_panel(ctx);
  const {message_id} =  await ctx.reply(LOAD_EMJ, {reply_to_message_id: ctx.message?.message_id});
  data.set_last_list_message_id(message_id);
  show_list(ctx, message_id, 0, 'текущий 👇');
});

// очистить список
bot.command('clear', async (ctx) => {
  console.log('ввел команду "/clear"');
  data.wait_for_name(false);
  kill_panel(ctx);
  const {message_id} =  await ctx.reply(LOAD_EMJ, {reply_to_message_id: ctx.message?.message_id});
  data.set_last_list_message_id(message_id);
  clear_list(ctx, message_id);
});

//показать помощь
bot.help(async (ctx) => {
  console.log('ввел команду "/help"');
  data.wait_for_name(false);
  kill_panel(ctx);
  const {message_id} =  await ctx.reply(LOAD_EMJ, {reply_to_message_id: ctx.message?.message_id});
  data.set_last_list_message_id(message_id);
  help(ctx, message_id);
});

//вывести список на печать
bot.command('print', async (ctx) => {
  console.log('ввел команду "/print"');
  data.wait_for_name(false);
  kill_panel(ctx);
  let current_message;
  //
  try {
    if (!data.is_empty) {
      current_message = await ctx.reply(
        '<b>'+escapeHtml(CHAT_NAME)+'</b>:\n' + data.list.map((v,i)=>{return (i+1)+'. '+'<code>' + escapeHtml(v) + '</code>'}).join('\n'),
        {
          reply_markup: {
              inline_keyboard: [[
                {text: "📛 очистить", callback_data: 'clear_action'},
                {text: "⚙", callback_data: 'settings'},
                {text: "🖥️ показать", callback_data: 'show_action'},
          ]]},
          parse_mode: 'html',
          reply_to_message_id: ctx.message?.message_id,
        });
    } else {
      current_message = await ctx.reply(
        '<b>'+escapeHtml(CHAT_NAME)+EMPTY_LIST_MES,
        {reply_markup: HELP_BTN, reply_to_message_id: ctx.message?.message_id, parse_mode: 'html'}
      );
    };
    data.set_last_list_message_id(current_message.message_id);
  } catch(err) {console.error('проблемы с выводом списка в сообщение (command(/print):\n', err);};
});

//настройки
bot.settings(async (ctx) => {
  console.log('ввел команду "/settings"');
  data.wait_for_name(false);
  kill_panel(ctx);
  const {message_id} =  await ctx.reply(LOAD_EMJ, {reply_to_message_id: ctx.message?.message_id});
  data.set_last_list_message_id(message_id);
  settings_panel(ctx, message_id);
});

//                ФУНКЦИИ. ОБРАБОТКА. Повторяемый код

async function show_list(ctx, is_message_id = undefined, ms = 0, action_text='') {
  const current_message_id = is_message_id || ctx.message?.message_id || ctx.callbackQuery?.message?.message_id;
  console.log('Запущена функция построения списка show_list.\n data.last_list_message_id=',data.last_list_message_id,'\ncurrent_message_id=',current_message_id);
  try {
    if (!data.is_empty) {
      //убить предыдущую панель
      if (data.last_list_message_id && data.last_list_message_id != current_message_id) {
        kill_panel(ctx);
      };
      await new Promise(r => setTimeout(r, ms));
      //обновить текущий список
      await ctx.telegram.editMessageText(ctx.chat.id, current_message_id, 0,
        '<b>'+escapeHtml(CHAT_NAME)+'</b>: '+escapeHtml(action_text),
        {
          reply_markup: {
              inline_keyboard: data.list.map((element, index)=>{return [{text: element, callback_data: `kick ${index}`}]})
              .concat([[{text: "📛 очистить", callback_data: 'clear_action'},{text: "⚙", callback_data: 'settings'}, {text: "🖨 вывести", callback_data: 'print'}, ]])
          },
          parse_mode: 'html',
          reply_to_message_id: ctx.message?.message_id,
        });
    } else {
      await ctx.telegram.editMessageText(
        ctx.chat.id, current_message_id, 0,
        '<b>'+escapeHtml(CHAT_NAME)+EMPTY_LIST_MES,
        {reply_markup: HELP_BTN, reply_to_message_id: ctx.message?.message_id, parse_mode: 'html'})
      .catch(err=>console.error(err));
    };
  } catch(err) {console.error('список не строится', err)};    
  
};

async function help(ctx, is_message_id = undefined, ms = 0) {
  const current_message_id = is_message_id || ctx.message?.message_id || ctx.callbackQuery?.message?.message_id;
  
  await new Promise(r => setTimeout(r, ms));
  
  ctx.telegram.editMessageText(ctx.chat.id, current_message_id, 0,
    'Как здесь все работает⁉ 🤨 Просто...\n\n1⃣ Напиши пару слов,\n или 🤔 занеси дело в to-do лист,\n или 🤓 накидай список покупок,\n или 🛫 запиши важную мелочь, чтобы не забыть в дорогу. \n\n2⃣ Когда придет время, открой список 👇 (/list)\n\n3⃣ Сделай \u{1FAF5} что-то из списка и ткни в пункт. Он исчезнет 👍\n\n 👉 ✍ 👇Пиши же:',
    {reply_to_message_id: current_message_id})
  .catch(err=>console.error('/help не смог помочь, споткнулся: ', err.name));
};

async function clear_list(ctx, is_message_id = undefined, ms = 0) {
  const current_message_id = is_message_id || ctx.message?.message_id || ctx.callbackQuery?.message?.message_id;
  //убедись, потом мочи
  await ctx.telegram.editMessageText(ctx.chat.id, current_message_id, 0,
    '<b>'+escapeHtml(CHAT_NAME)+'</b>: 😱 ВЕСЬ СПИСОК БУДЕТ УДАЛЕН!\n\n>> подтверди действие:',
    {
      reply_markup: {
          inline_keyboard: [[{text:'⬅ отмена', callback_data: 'show_action'}, {text: "📛 очистить", callback_data: 'confirmed_clear_action'}]]
      },
      parse_mode: 'html',
      reply_to_message_id: ctx.message?.message_id,
    });
};


async function kill_panel(ctx, current_message_id = undefined) {
  try {
    if (data.last_list_message_id && current_message_id != data.last_list_message_id) {
      ctx.telegram.editMessageReplyMarkup(ctx.chat.id, data.last_list_message_id, undefined, {}).catch(err=>console.error('не нашел старых кнопок, чтобы их вычистить:\n',err.name));
    };
  } catch(err) { console.error('не смог очистить панель под сообщением:\n', err.name)};
};

async function settings_panel(ctx, is_message_id = undefined) {
  const current_message_id = is_message_id || ctx.message?.message_id || ctx.callbackQuery?.message?.message_id;
  console.log('Панель настроек');
  try {
    //убить предыдущий список
    if (current_message_id) {
      if (!data.is_empty && data.last_list_message_id && data.last_list_message_id != current_message_id) {
        ctx.telegram.editMessageText(
          ctx.chat.id, data.last_list_message_id, 0,
          data.list.map((v,i)=>{return (i+1)+'. '+'<code>'+escapeHtml(v)+'</code>'}).join('\n'), {parse_mode: 'html'})
        .catch(err=>console.error('не смог убить предыдущий список'));
      };
    };
    //обновить текущий список
    await ctx.telegram.editMessageText(ctx.chat.id, current_message_id, 0,
      '⚙ Настройки: <i>здесь приведены настройки работы списка</i>\n\n<b>имя</b> - изменить название списка\n\n<b>разделитель</b> - ввод нескольких значений за один раз\n\n<b>режим</b> - удалять элементы по нажатию или с подтверждением\n\n>> выбери действие:',
      {reply_markup: {
        inline_keyboard: [
          [ {text: `имя: ( ${escapeHtml(CHAT_NAME)} )`, callback_data: 'set_list_name_action'}],
          [ {text: `разделитель: ( ${data.delimiter === '\n' ? '↲' : data.delimiter} )`, callback_data: 'set_delimit_action'}],
          [ {text: `режим: ( ${data.kill_mode ? data.kill_mode : 'easy'} )`, callback_data: 'set_kill_mode_action'}],
          [ {text:'⬅ к списку', callback_data: 'show_action'} ],
        ]},
        parse_mode: 'html'
      }
    ).catch(err=>console.error('что-то не так с построением меню настроек: ', err.name));
  } catch(err) {console.error('панель настроек не строится', err)};    
};

//            ACTION: КНОПКИ-ответы на CallBackQuery

bot.action('set_kill_mode_action', async (ctx) =>{
  //confirmation
  console.log('нажал "изменить режим"');
  await ctx.telegram.editMessageText(
    ctx.chat.id, ctx.callbackQuery.message?.message_id, 0,
    `⚙ Настройки: <b>режим удаления</b> - удалять элементы по нажатию или с подтверждением?\n\n( <b>easy</b> ) по нажатию - быстрый режим удаления элементов из списка\n( <b>confirmation</b> ) с подтвеждением - после каждого нажатия на элемент списка потребуется подтвердить удаление\n\n>> текущий режим: ( ${data.kill_mode ? data.kill_mode: 'easy'} )\n>> выбери режим:`,
    { parse_mode: 'html',
      reply_markup: {
      inline_keyboard: [
        [ {text:'с подтверждением', callback_data: 'kill_mode confirmation'},
          {text:'по нажатию', callback_data: 'kill_mode easy'}],
        [
          {text:'⬅ назад к настройкам', callback_data: 'settings'}
        ],
    ]}}).catch(err=>console.error('панель выбора режима удаления не строится', err))
});

bot.action(/^kill_mode \w+/, async (ctx)=>{
  console.log('выбран режим удаления... "'+ctx.callbackQuery.data+'"');
  try {
    let kill_mode = undefined;
    switch (ctx.callbackQuery.data.slice(10)) {
      case "confirmation":
        kill_mode = "confirmation";
        break;
      case "easy":
        kill_mode = "easy";
        break;
    };
    await data.set_kill_mode(kill_mode);
  } catch (err) {console.error('не смог установить разделитель: ', err.name)};
  settings_panel(ctx);
});

bot.action(/^kick /, async (ctx) => {
  if (ctx.callbackQuery.message?.message_id == data.last_list_message_id) {
    const index = Number(ctx.callbackQuery.data.slice(5));
    
    console.log(`нажал на элемент в списке №${index} "${data.list[index]}"`);

    if (data.kill_mode === 'easy' || !data.kill_mode) {
      kill_helper(ctx, index);
    } else {
      //@TODO: закончить проработку confirmation mode
      console.log('непростой режим удаления, не изи: ', data.kill_mode);
      ctx.answerCbQuery(`${data.list[index]} - точно сделано?`);
      //убедись, потом мочи
      await ctx.telegram.editMessageText(ctx.chat.id, ctx.callbackQuery.message?.message_id, 0,
        `✋ ${escapeHtml(CHAT_NAME)}: удалить "<b>${data.list[index]}</b>" из списка?\n\n>> подтверди действие:`,
        {
          reply_markup: {
              inline_keyboard: [[{text:'⬅ отмена', callback_data: 'show_action'}, {text: "👍 сделано!", callback_data: `confirmed_kick_action ${index}`}]]
          },
          parse_mode: 'html',
          reply_to_message_id: ctx.message?.message_id,
        });
    };
  } else {
    ctx.answerCbQuery('🤷‍♂️ неактуальный список');
  }
});

bot.action(/^confirmed_kick_action /, async (ctx)=>{
  const index = Number(ctx.callbackQuery.data.slice(22));
  kill_helper(ctx, index);
});

async function kill_helper(ctx, index) {
  const answer = data.list[index] ? `${data.list[index]} - сделано! 👌` : '🤷‍♂️ не нашел в текущем списке';
  ctx.answerCbQuery(answer);
  await data.kick(index);
  show_list(ctx, data.last_list_message_id, 0, answer);
};

bot.action('set_list_name_action', async (ctx)=>{
  console.log('нажал "изменить имя"');
  await ctx.telegram.editMessageText(
    ctx.chat.id, ctx.callbackQuery.message?.message_id, 0,
    `⚙ Настройки: изменение названия списка\n\n>> текущее значение: <s>${escapeHtml(CHAT_NAME)}</s>\n>> введи новое значение: <i>(до 15 символов)</i>:`,
    { parse_mode: 'html',
      reply_markup: {
      inline_keyboard: [
        [ {text:'⬅ назад к настройкам', callback_data: 'settings'}],
    ]}}).catch(err=>console.error('панель настроек для ввода нового имени не строится', err));
  data.wait_for_name(true);
});

bot.action('set_delimit_action', async (ctx)=> {
  console.log('нажал "разделитель"');
  await ctx.telegram.editMessageText(
    ctx.chat.id, ctx.callbackQuery.message?.message_id, 0,
    `⚙ Настройки: режим ввода значений списка через разделитель...\n\nЕсли разделитель задан, можно вводить несколько значений за один раз. Например, ввод: "хлеб, лук, масло" без разделителя будет записан в одну строку списка. Если же выбрать разделитель "запятая", то список пополнится каждым значением отдельно: "хлеб", "лук" и "масло".\n\n>> текущий разделитель: ( ${data.delimiter === '\n' ? '↲' : data.delimiter} )\n>> выбери разделитель:`,
    { parse_mode: 'html',
      reply_markup: {
      inline_keyboard: [
        [ {text:'( без ): каждый ввод - новая запись', callback_data: 'delimit null'}],
        [ {text:'( ↲ ) с новой строки', callback_data: 'delimit enter'}],
        [ {text:'( , ) запятая', callback_data: 'delimit comma'},
          {text:'( ; ) точка с запятой', callback_data: 'delimit semicolon'}
        ],
        [ {text:'⬅ назад к настройкам', callback_data: 'settings'}],
    ]}}).catch(err=>console.error('панель настроек при вводе разделителя не строится', err));
});

bot.action(/^delimit \w+/, async (ctx)=>{
  console.log('выбран разделитель... "'+ctx.callbackQuery.data+'"');
  try {
    let delimiter = null;
    switch (ctx.callbackQuery.data.slice(8)) {
      case "comma":
        delimiter = ",";
        break;
      case "semicolon":
        delimiter = ";";
        break;
      case "enter":
        delimiter = "\n";
        break;
    };
    await data.set_delimiter(delimiter);
  } catch (err) {console.error('не смог установить разделитель: ', err.name)};

  settings_panel(ctx);
});

bot.action('show_action', async (ctx)=>{show_list(ctx,undefined, ms = 0, action_text='текущий 👇')});

bot.action('clear_action', async (ctx) => {
  console.log('нажал "очистить"');
  clear_list(ctx);
});

bot.action('confirmed_clear_action', async (ctx)=>{
  console.log('подтвердил очистку списка"');
  ctx.answerCbQuery('🤲 список очищен!');
  await data.clear_list();
  ctx.editMessageText('<b>'+escapeHtml(CHAT_NAME)+'</b>: 🤲 <i>список очищен!</i>', {reply_markup: HELP_BTN, parse_mode: 'html'})
  .catch(err=>console.error('ошибка в confirmed_clear_action:\n',err));
});

bot.action('help', async (ctx) => {
  console.log('нажал "помощь"');
  help(ctx);
});

bot.action('print', async (ctx) => {
  console.log('нажал "вывести"');
  //
  if (!data.is_empty) {
    ctx.answerCbQuery('готово! 🖨 можно пересылать...');
    ctx.editMessageText(
      '<b>'+escapeHtml(CHAT_NAME)+'</b>:\n'+data.list.map((v,i)=>{return (i+1)+'. '+'<code>' + escapeHtml(v) + '</code>'}).join('\n'),
      {
        reply_markup: {
            inline_keyboard: [[
              {text: "📛 очистить", callback_data: 'clear_action'},
              {text: "⚙", callback_data: 'settings'},
              {text: "🖥️ показать", callback_data: 'show_action'},
        ]]},
        parse_mode: 'html',
        reply_to_message_id: ctx.message?.message_id,
      }
    )
    .catch(err=>console.error('проблемы с выводом списка в сообщение', err));
  } else {
    ctx.answerCbQuery(CHAT_NAME+': 🤷‍♂️ текущий список пуст...');
  };
});

bot.action('settings', async (ctx) => {
  console.log('нажал "настройки"');
  data.wait_for_name(false);
  settings_panel(ctx);
});

bot.on('callback_query', async (ctx)=>{
  console.warn('незнакомая кнопка: ', ctx.callbackQuery?.data)
});

//            Ответы на СООБЩЕНИЯ
//ответ на стикеры
bot.on(message('sticker'), async (ctx) => {
  const sticker_value = 'стикер: '+ ctx.message.sticker.set_name +': '+ ctx.message.sticker.emoji;
  console.log('STIKER!\n'+sticker_value);
  kill_panel(ctx);
  const answer = await data.insert(sticker_value) ? `"${sticker_value}" добавлено 👍` : `🤷‍♂️ "${sticker_value}" уже было в списке`;

  const {message_id} =  await ctx.reply('...', {reply_to_message_id: ctx.message?.message_id});
  data.set_last_list_message_id(message_id);
  show_list(ctx, message_id, 0, answer);
});

//обработка текстового сообщения:
bot.on(message('text'), async (ctx) => {
  const text = ctx.message?.text;
  kill_panel(ctx);
  console.log(`в ${JSON.stringify(ctx.chat,null,1)} написал сообщение: "${text}"`);

  try {
    //обработка ввода нового имени списка чата
    if (data.list_name.wait_for_name) {
      const list_name15 = text.slice(0, 15);
      await data.set_list_name(list_name15);
      CHAT_NAME = list_name15;
      data.wait_for_name(false);
      const { message_id } = await ctx.reply('...👍...', {reply_to_message_id: ctx.message?.message_id});
      data.set_last_list_message_id(message_id);
      return settings_panel(ctx, message_id);

    //в групповых чатах отвечать только на команды и прямые обращения (на @_ и @имя_бота_)
    } else if (ctx.chat.type != 'private') {
      let answer;
      //@TODO: HTML_escape
      if (text.slice(0,2) === '@ ') { 
        answer = text.slice(2);
      } else if (text.slice(0,process.env.BOT_NAME.length+1) === `@${process.env.BOT_NAME}`) {
        answer = text.slice(process.env.BOT_NAME.length + 1)
      };

      if (answer) {
        console.log('обращение в групповом чате, пишем: ',answer);
        answer = await data.insert(answer) ? `"${answer}" добавлено 👍` : `🤷‍♂️ "${answer}" уже было в списке`;
        const { message_id } = await ctx.reply('...✍...', {reply_to_message_id: ctx.message?.message_id});
        data.set_last_list_message_id(message_id);
        return show_list(ctx, message_id, 0, answer);
      } else {
        console.log('общение в групповом чате, не подслушиавем...');
      };

    //любоЕ слово попадает в список, кроме ключевых слов выше, кроме команд и спец. символов
    } else if ((/[^\/]/).test(text[0])) {
      const answer = await data.insert(text) ? `"${text}" добавлено 👍` : `🤷‍♂️ "${text}" уже было в списке`;
      const { message_id } = await ctx.reply('...✍...', {reply_to_message_id: ctx.message?.message_id});
      data.set_last_list_message_id(message_id);
      return show_list(ctx, message_id, 0, answer);
    
    //все остальное написанное - непонятно
    } else {
      const { message_id } = await ctx.reply(`незнакомая команда 🤷‍♂️`, {reply_to_message_id: ctx.message?.message_id} );
      data.set_last_list_message_id(message_id);
    };
  } catch(err) { console.error('проблема с обработкой введеного текста',err); };
});

//        ФИНАЛ. Стартуем...
//обработка ошибок
bot.catch((err, ctx) => {
  console.error(`ошибка обработки: ${ctx.updateType}`, err)
});

//запуск
bot.launch();

// Enable graceful stop
process.once('SIGINT', () => {
  console.log('Завершение работы...');
  bot.stop('SIGINT');
});
process.once('SIGTERM', () => {
  bot.stop('SIGTERM');
  console.log('Работа завершена.');
});