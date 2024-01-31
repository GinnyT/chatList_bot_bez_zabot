///--GLOBAL statements
//
// подключения
require('dotenv').config({ path: `${process.env.NODE_ENV}.env` });

const DATA = require('./chat_data_in_files'); //данные в файле

const { Telegraf } = require('telegraf');
const { message } = require('telegraf/filters');
//@TODO: не нашел простой способ вызвать единожды асинхронную функцию getMe() так, чтобы получить актуальное имя бота, но не грузить запросом каждый вызов внутри use. пока решил зашить в окружение
const bot = new Telegraf(process.env.TOKEN);
console.log('Стартует бот: ',process.env.BOT_NAME)

// константы
let counter = 0;
let data = {};
let CHAT_NAME = 'Список';
const LIST_BTN = {inline_keyboard: [[{text: CHAT_NAME, callback_data: 'list'}]]};
const HELP_BTN = {inline_keyboard: [[{text: "помощь", callback_data: 'help_action'}]]};
const LIST_N_HELP_BTN = {inline_keyboard: [[LIST_BTN.inline_keyboard[0][0], HELP_BTN.inline_keyboard[0][0]]]}
const LOAD_EMJ = '...\u{1F90C}...';
const EMPTY_LIST_MES = '</b>: <i>пока пусто...</i>🤷‍♂️ запиши что-нибудь в свой список:';
//хелпер для избежания неприятностей в режиме parse-mode html
const escapeHtml = (unsafe) => {
  return unsafe.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
};
///--
//
///--ОБОЛОЧКА обработки каждого сообщения
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
// МЕНЮ команд
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
  },], /* {scope: {type: 'all_private_chats'}}, 'ru' */
);
///--
//
///--parts START, LIST and SHOW
bot.action('show_action', async (ctx)=>{
  data.wait_for_value_at(undefined);
  show_list_helper(ctx,undefined, ms = 0, action_text=' 👇')
});
//
bot.command('start', async (ctx) => {
  console.log('ввел команду "/start"');
  data.wait_for_name(false);
  kill_panel_helper(ctx);
  await ctx.reply('Привет! Помочь или сразу к делу? 👇✍', {reply_to_message_id: ctx.message?.message_id} )
  .catch(err=>console.error(err));

  const {message_id} = await ctx.reply('...');
  data.set_last_list_message_id(message_id);
  show_list_helper(ctx, message_id, 0, 'старый список найден. с возвращением! \u{1FAF6}');
});
// показать список 
bot.command('list', async (ctx) => {
  console.log('ввел команду "/list"');
  data.wait_for_name(false);
  kill_panel_helper(ctx);
  const {message_id} =  await ctx.reply(LOAD_EMJ, {reply_to_message_id: ctx.message?.message_id});
  data.set_last_list_message_id(message_id);
  show_list_helper(ctx, message_id, 0, ' 👇');
});
//
async function show_list_helper(ctx, is_message_id = undefined, ms = 0, action_text='') {
  const current_message_id = is_message_id || ctx.message?.message_id || ctx.callbackQuery?.message?.message_id;
  console.log('Запущена функция построения списка show_list_helper.\n data.last_list_message_id=',data.last_list_message_id,'\ncurrent_message_id=',current_message_id);
  try {
    if (!data.is_empty) {
      //убить предыдущую панель
      if (data.last_list_message_id && data.last_list_message_id != current_message_id) {
        kill_panel_helper(ctx);
      };
      await new Promise(r => setTimeout(r, ms));
      //сформировать массив элементов
      let elemets_arr = data.list.map((element, index)=>{
        let row = [];
        if (data.edit_mode) {
          row = [
            {text: '⬆', callback_data: `move_up ${index}`},
            {text: '🗑️ '+ element, callback_data: `kick ${index}`},
            {text: '✏️', callback_data: `edit ${index}`},
            
          ];
        } else {
          row = [{text: element, callback_data: `kick ${index}`}];
        }
        return row;
      });
      //обновить текущий список
      await ctx.telegram.editMessageText(ctx.chat.id, current_message_id, 0,
        '<b>'+escapeHtml(CHAT_NAME)+'</b>: '+escapeHtml(action_text),
        {
          reply_markup: {
              inline_keyboard: elemets_arr.concat([[
                {text: "📛 очистить", callback_data: 'clear_action'},
                {text: data.edit_mode ? '✍️...' : '✏️', callback_data: 'edit_mode_action'},
                {text: "⚙", callback_data: 'settings'},
                {text: "🖨 вывести", callback_data: 'print'}, 
          ]])},
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
//
async function kill_panel_helper(ctx, current_message_id = undefined) {
  try {
    if (data.last_list_message_id && current_message_id != data.last_list_message_id) {
      ctx.telegram.editMessageReplyMarkup(ctx.chat.id, data.last_list_message_id, undefined, {}).catch(err=>console.error('не нашел старых кнопок, чтобы их вычистить:\n',err.name));
    };
  } catch(err) { console.error('не смог очистить панель под сообщением:\n', err.name)};
};
///--
//
///--part EDIT
bot.action('edit_mode_action', async (ctx) => {
  console.log('нажал режим "редактирования", было:', data.edit_mode);
  await data.toggle_edit_mode();
  ctx.answerCbQuery(data.edit_mode ? 'включен ✍️ режим редактирования' : 'режим редактирования ✏️ выключен');
  const action_text = data.edit_mode ? ' ✍️ режим редактирования' : ' 👇'; 
  show_list_helper(ctx, undefined, 0, action_text);
});
//
bot.action(/^move_up \d+/, async (ctx)=>{
  if (ctx.callbackQuery.message?.message_id == data.last_list_message_id) {
    const index = Number(ctx.callbackQuery.data.slice(7));
    const element = data.list[index];
    console.log(`нажал поднять индекс №${index} "${element}"`);
    ctx.answerCbQuery('все выше! ☝️').catch(err=>console.error('не смог показать всплывашку о поднятии в move_up:\n',err.name));
    await data.move_up(index);
    show_list_helper(ctx, undefined, 0, `"${element}" все выше ☝️`);
  } else {
    ctx.answerCbQuery('🤷‍♂️ неактуальный список');
  }
});
//@TODO: закончить здесь
bot.action(/^edit \d+/, async(ctx) =>{
  if (ctx.callbackQuery.message?.message_id == data.last_list_message_id) {
    const index = Number(ctx.callbackQuery.data.slice(4));
    const element = data.list[index];
    console.log(`нажал редактировать индекс №${index} "${element}"`);

    await ctx.telegram.editMessageText(
      ctx.chat.id, data.last_list_message_id, 0,
      `${escapeHtml(CHAT_NAME)}: ✏️ ...\n\n>> текущее значение: <s>${element}</s>\n>> введи новое значение:`,
      {
        parse_mode: 'html',
        reply_markup: {
        inline_keyboard: [[{text:'⬅ отмена', callback_data: 'show_action'}],]}
      }
    ).catch(err=>console.error('панель настроек для ввода нового имени не строится', err));
    data.wait_for_value_at(index);

    /* ctx.answerCbQuery('все выше! ☝️').catch(err=>console.error('не смог показать всплывашку о поднятии в move_up:\n',err.name));
    await data.move_up(index);
    show_list_helper(ctx, undefined, 0, `"${element}" все выше ☝️`); */
  } else {
    ctx.answerCbQuery('🤷‍♂️ неактуальный список');
  }
});
///--
//
///--part PRINT
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
};});
//
bot.command('print', async (ctx) => {
  console.log('ввел команду "/print"');
  data.wait_for_name(false);
  data.wait_for_value_at(undefined);
  kill_panel_helper(ctx);
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
///
//
///--part HELP
bot.action('help_action', async (ctx) => {
  console.log('нажал "помощь"');
  help_helper(ctx);
});
//
bot.help(async (ctx) => {
  console.log('ввел команду "/help"');
  data.wait_for_name(false);
  data.wait_for_value_at(undefined);
  kill_panel_helper(ctx);
  const {message_id} =  await ctx.reply(LOAD_EMJ, {reply_to_message_id: ctx.message?.message_id});
  data.set_last_list_message_id(message_id);
  help_helper(ctx, message_id);
});
//
async function help_helper(ctx, is_message_id = undefined, ms = 0) {
  const current_message_id = is_message_id || ctx.message?.message_id || ctx.callbackQuery?.message?.message_id;
  
  await new Promise(r => setTimeout(r, ms));
  
  ctx.telegram.editMessageText(ctx.chat.id, current_message_id, 0,
    'Как здесь все работает⁉ 🤨 Просто...\n\n1⃣ Напиши пару слов,\n или 🤔 занеси дело в to-do лист,\n или 🤓 накидай список покупок,\n или 🛫 запиши важную мелочь, чтобы не забыть в дорогу. \n\n2⃣ Когда придет время, открой список 👇 (/list)\n\n3⃣ Сделай \u{1FAF5} что-то из списка и ткни в пункт. Он исчезнет 👍\n\n 👉 ✍ 👇Пиши же:',
    {reply_to_message_id: current_message_id})
  .catch(err=>console.error('/help не смог помочь, споткнулся: ', err.name));
};
///--
//
///--part KICK
bot.action('set_kick_mode_action', async (ctx) =>{
  //confirmation
  console.log('нажал "изменить режим"');
  await ctx.telegram.editMessageText(
    ctx.chat.id, ctx.callbackQuery.message?.message_id, 0,
    `⚙ Настройки: <b>режим удаления</b> - удалять элементы по нажатию или с подтверждением?\n\n( <b>easy</b> ) по нажатию - быстрый режим удаления элементов из списка\n( <b>confirmation</b> ) с подтвеждением - после каждого нажатия на элемент списка потребуется подтвердить удаление\n\n>> текущий режим: ( ${data.kick_mode ? data.kick_mode: 'easy'} )\n>> выбери режим:`,
    { parse_mode: 'html',
      reply_markup: {
      inline_keyboard: [
        [ {text:'с подтверждением', callback_data: 'kick_mode confirmation'},
          {text:'по нажатию', callback_data: 'kick_mode easy'}],
        [
          {text:'⬅ назад к настройкам', callback_data: 'settings'}
        ],
    ]}}).catch(err=>console.error('панель выбора режима удаления не строится', err.name))
});
//
bot.action(/^kick_mode \w+/, async (ctx)=>{
  console.log('выбран режим удаления... "'+ctx.callbackQuery.data+'"');
  try {
    let kick_mode = undefined;
    switch (ctx.callbackQuery.data.slice(10)) {
      case "confirmation":
        kick_mode = "confirmation";
        break;
      case "easy":
        kick_mode = "easy";
        break;
    };
    await data.set_kick_mode(kick_mode);
  } catch (err) {console.error('не смог установить разделитель: ', err.name)};
  settings_panel_helper(ctx);
});
//
bot.action(/^kick \d+/, async (ctx) => {
  if (ctx.callbackQuery.message?.message_id == data.last_list_message_id) {
    const index = Number(ctx.callbackQuery.data.slice(5));
    
    console.log(`нажал на элемент в списке №${index} "${data.list[index]}"`);

    if (data.kick_mode === 'easy' || !data.kick_mode) {
      kick_helper(ctx, index);
    } else {
      console.log('непростой режим удаления, не изи: ', data.kick_mode);
      ctx.answerCbQuery((data.list[index].length > 182 ? data.list[index].slice(0,182).concat('...') : data.list[index]).concat(' точно сделано?'))
      .catch(err=>console.error('не смог показать всплывашку в action(/^kick /):\n',err));
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
//
bot.action(/^confirmed_kick_action /, async (ctx)=>{
  const index = Number(ctx.callbackQuery.data.slice(22));
  kick_helper(ctx, index);
});
//
async function kick_helper(ctx, index) {
  const answer = (data.list[index].length > 184 ? data.list[index].slice(0,184).concat('...') : data.list[index]).concat(' - сделано! 👍');
  ctx.answerCbQuery(answer).catch(err=>console.error('не смог показать всплывашку в kick_helper:\n', err));
  await data.kick(index);
  show_list_helper(ctx, data.last_list_message_id, 0, answer);
};
///--
//
///--part SETTINGS
bot.action('settings', async (ctx) => {
  console.log('нажал "настройки"');
  data.wait_for_name(false);
  data.wait_for_value_at(undefined);
  settings_panel_helper(ctx);
});
//
bot.settings(async (ctx) => {
  console.log('ввел команду "/settings"');
  data.wait_for_name(false);
  data.wait_for_value_at(undefined);
  kill_panel_helper(ctx);
  const {message_id} =  await ctx.reply(LOAD_EMJ, {reply_to_message_id: ctx.message?.message_id});
  data.set_last_list_message_id(message_id);
  settings_panel_helper(ctx, message_id);
});
//
async function settings_panel_helper(ctx, is_message_id = undefined) {
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
          [ {text: `разделитель: ( ${data.delimiter === '\n' ? '⏎' : data.delimiter} )`, callback_data: 'set_delimit_action'}],
          [ {text: `режим: ( ${data.kick_mode ? data.kick_mode : 'easy'} )`, callback_data: 'set_kick_mode_action'}],
          [ {text:'⬅ к списку', callback_data: 'show_action'} ],
        ]},
        parse_mode: 'html'
      }
    ).catch(err=>console.error('что-то не так с построением меню настроек: ', err.name));
  } catch(err) {console.error('панель настроек не строится', err)};    
};
//
///--list name actions
bot.action('set_list_name_action', async (ctx)=>{
  console.log('нажал "изменить имя"');
  await ctx.telegram.editMessageText(
    ctx.chat.id, ctx.callbackQuery.message?.message_id, 0,
    `⚙ Настройки: изменение названия списка\n\n>> текущее значение: <s>${escapeHtml(CHAT_NAME)}</s>\n>> введи новое значение: <i>(до 25 символов)</i>:`,
    { parse_mode: 'html',
      reply_markup: {
      inline_keyboard: [
        [ {text:'⬅ назад к настройкам', callback_data: 'settings'}],
    ]}}).catch(err=>console.error('панель настроек для ввода нового имени не строится', err));
  data.wait_for_name(true);
});
//
///--delimiter actions
bot.action('set_delimit_action', async (ctx)=> {
  console.log('нажал "разделитель"');
  await ctx.telegram.editMessageText(
    ctx.chat.id, ctx.callbackQuery.message?.message_id, 0,
    `⚙ Настройки: режим ввода значений списка через разделитель...\n\nЕсли разделитель задан, можно вводить несколько значений за один раз. Например, ввод: "хлеб, лук, масло" без разделителя будет записан в одну строку списка. Если же выбрать разделитель "запятая", то список пополнится каждым значением отдельно: "хлеб", "лук" и "масло".\n\n>> текущий разделитель: ( ${data.delimiter === '\n' ? '⏎' : data.delimiter} )\n>> выбери разделитель:`,
    { parse_mode: 'html',
      reply_markup: {
      inline_keyboard: [
        [ {text:'( без ): каждый ввод - новая запись', callback_data: 'delimit null'}],
        [ {text:'( ⏎ ) с новой строки', callback_data: 'delimit enter'}],
        [ {text:'( , ) запятая', callback_data: 'delimit comma'},
          {text:'( ; ) точка с запятой', callback_data: 'delimit semicolon'}
        ],
        [ {text:'⬅ назад к настройкам', callback_data: 'settings'}],
    ]}}).catch(err=>console.error('панель настроек при вводе разделителя не строится', err));
});
//
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

  settings_panel_helper(ctx);
});
///--
//
///--part CLEAR
bot.action('clear_action', async (ctx) => {
  console.log('нажал "очистить"');
  clear_list_helper(ctx);
});
//
bot.action('confirmed_clear_action', async (ctx)=>{
  console.log('подтвердил очистку списка"');
  ctx.answerCbQuery('🤲 список очищен!');
  await data.clear_list();
  ctx.editMessageText('<b>'+escapeHtml(CHAT_NAME)+'</b>: 🤲 <i>список очищен!</i>', {reply_markup: HELP_BTN, parse_mode: 'html'})
  .catch(err=>console.error('ошибка в confirmed_clear_action:\n',err));
});
// очистить список
bot.command('clear', async (ctx) => {
  console.log('ввел команду "/clear"');
  data.wait_for_name(false);
  data.wait_for_value_at(undefined);
  kill_panel_helper(ctx);
  const {message_id} =  await ctx.reply(LOAD_EMJ, {reply_to_message_id: ctx.message?.message_id});
  data.set_last_list_message_id(message_id);
  clear_list_helper(ctx, message_id);
});
//
async function clear_list_helper(ctx, is_message_id = undefined, ms = 0) {
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
///--
//
///--UKNOWN action
bot.on('callback_query', async (ctx)=>{
  console.warn('незнакомая кнопка: ', ctx.callbackQuery?.data)
});
///--
//
///--ON MESSAGES ответы на СООБЩЕНИЯ
// ответ на стикеры
bot.on(message('sticker'), async (ctx) => {
  const sticker_value = 'стикер: '+ ctx.message.sticker.set_name +': '+ ctx.message.sticker.emoji;
  console.log('STIKER!\n'+sticker_value);
  kill_panel_helper(ctx);
  const answer = await data.insert(sticker_value) ? `"${sticker_value}" добавлено 👍` : `🤷‍♂️ "${sticker_value}" уже было в списке`;

  const {message_id} =  await ctx.reply('...', {reply_to_message_id: ctx.message?.message_id});
  data.set_last_list_message_id(message_id);
  show_list_helper(ctx, message_id, 0, answer);
});
//
///--текстовые сообщения
bot.on(message('text'), async (ctx) => {
  const text = ctx.message?.text;
  kill_panel_helper(ctx);
  console.log(`в ${JSON.stringify(ctx.chat,null,1)} написал сообщение: "${text}"`);
  try {
    //обработка редактирования существующего элемента
    if (data.wait_for_value_index >= 0) {
      console.log('обработка редактирования существующего элемента');
      const answer = await data.update_value_at_wait_for_value_index(text) ? `"${text}" изменено 👍` : `🤷‍♂️ "${text}" уже было в списке`;
      const { message_id } = await ctx.reply('...✍...', {reply_to_message_id: ctx.message?.message_id});
      data.set_last_list_message_id(message_id);
      data.wait_for_value_at(undefined);
      return show_list_helper(ctx, message_id, 0, answer);
    //обработка ввода нового имени списка чата
    } else if (data.list_name.wait_for_name) {
      const list_name25 = text.slice(0, 25);
      await data.set_list_name(list_name25);
      CHAT_NAME = list_name25;
      data.wait_for_name(false);
      const { message_id } = await ctx.reply('...👍...', {reply_to_message_id: ctx.message?.message_id});
      data.set_last_list_message_id(message_id);
      return settings_panel_helper(ctx, message_id);

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
        return show_list_helper(ctx, message_id, 0, answer);
      } else {
        console.log('общение в групповом чате, не подслушиавем...');
      };

    //любоЕ слово попадает в список, кроме ключевых слов выше, кроме команд и спец. символов
    } else if ((/[^\/]/).test(text[0])) {
      const answer = await data.insert(text) ? `"${text}" добавлено 👍` : `🤷‍♂️ "${text}" уже было в списке`;
      const { message_id } = await ctx.reply('...✍...', {reply_to_message_id: ctx.message?.message_id});
      data.set_last_list_message_id(message_id);
      return show_list_helper(ctx, message_id, 0, answer);
    
    //все остальное написанное - непонятно
    } else {
      const { message_id } = await ctx.reply(`незнакомая команда 🤷‍♂️`, {reply_to_message_id: ctx.message?.message_id} );
      data.set_last_list_message_id(message_id);
    };
  } catch(err) { console.error('проблема с обработкой введеного текста',err); };
});
///--
//
///--ФИНАЛ. Стартуем...
// обработка ошибок
bot.catch((err, ctx) => {
  console.error(`ошибка обработки: ${ctx.updateType}`, err)
});
// запуск
bot.launch();
// enable graceful stop
process.once('SIGINT', () => {
  console.log('Завершение работы...');
  bot.stop('SIGINT');
});
process.once('SIGTERM', () => {
  bot.stop('SIGTERM');
  console.log('Работа завершена.');
});