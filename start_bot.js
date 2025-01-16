///--GLOBAL statements

const DB = require('./chat_data_in_db');
const { Pool } = require('pg');
const { Telegraf } = require('telegraf');
const { message } = require('telegraf/filters');

//@TODO: не нашел простой способ вызвать единожды асинхронную функцию getMe() так, чтобы получить актуальное имя бота, но не грузить запросом каждый вызов внутри use. пока решил зашить в окружение
const bot = new Telegraf(process.env.TOKEN);
console.log(`Стартует бот: @${process.env.BOT_NAME}`);

//Окружение здесь?
//console.log(`process.env=\n${JSON.stringify(process.env, null, 1)}`);

//Экземпляр бд коннектора
//const db_pool = new Pool();
// константы
let counter = 0;
let db_data;
let CHAT_NAME = 'Список'; //@todo зачем?
const LIST_BTN = {inline_keyboard: [[{text: CHAT_NAME, callback_data: 'list'}]] }
const HELP_BTN = {inline_keyboard: [[{text: "помощь", callback_data: 'help_action'}]] }
const LIST_N_HELP_BTN = {inline_keyboard: [[LIST_BTN.inline_keyboard[0][0], HELP_BTN.inline_keyboard[0][0]]]}
const LOAD_EMJ = '...\u{1F90C}...';
const EMPTY_LIST_MES = '</b>: <i>пока пусто...</i>🤷‍♂️ запиши что-нибудь в свой список:';
//хелпер для избежания неприятностей в режиме parse-mode html
const escapeHtml = (unsafe) => {
  return unsafe.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
 }
///--
//
///--ОБОЛОЧКА обработки каждого сообщения
bot.use(async (ctx, next) => {
  const start_time = new Date();
  console.log(`\n${new Date().toLocaleString()}---------------начало обработки:\n прилетело из чата: ${JSON.stringify(ctx.chat)} от ${ctx.from.username} тип: ${ctx.updateType}`);
  
  if (ctx.updateType === 'inline_query') {
    console.warn('inline_query (не обрабатывается)=\n',JSON.stringify(ctx.inlineQuery,null,1));
  //
  } else {
    db_data = await DB.init(ctx.chat, new Pool());
    CHAT_NAME = db_data.list_name.name;
    console.log(CHAT_NAME);
    await next();
    await db_data.db.end();
  }
  console.log(`---------------время обработки: ${new Date() - start_time}`);
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
    description: 'вывести список 🖨',
  },
  {
    command: 'settings',
    description: 'настройки ⚙',
  }],{scope: {type: 'default'}, language_code: 'ru'}
);
//
bot.telegram.setMyCommands([
  {
    command: 'help',
    description: 'descriptions 🤔',
  },
  {
    command: 'list',
    description: 'the list of the chat 💬',
  },
  { 
    command: 'print',
    description: 'print out the 🖨',
  },
  {
    command: 'settings',
    description: 'settings of the chat list ⚙',
  }],{scope: {type: 'default'}, language_code: 'en'}
);
///--
//
///--parts START, LIST and SHOW
bot.action('show_action', async (ctx)=>{
  db_data.wait_for_value_at(undefined);
  show_list_helper(ctx,undefined, ms = 0, action_text=' 👇')
});
//
bot.command('start', async (ctx) => {
  console.log('ввел команду "/start"');
  db_data.wait_for_name(false);
  kill_panel_helper(ctx);
  await ctx.reply('Привет! Помочь или сразу к делу? 👇✍', {reply_to_message_id: ctx.message?.message_id} )
  .catch(err=>console.error(err));

  const {message_id} = await ctx.reply('...');
  db_data.set_last_list_message_id(message_id);
  show_list_helper(ctx, message_id, 0, 'старый список найден. с возвращением! \u{1FAF6}');
});
// показать список 
bot.command('list', async (ctx) => {
  console.log('ввел команду "/list"');
  db_data.wait_for_name(false);
  kill_panel_helper(ctx);
  const {message_id} =  await ctx.reply(LOAD_EMJ, {reply_to_message_id: ctx.message?.message_id});
  db_data.set_last_list_message_id(message_id);
  show_list_helper(ctx, message_id, 0, ' 👇');
});
//
async function show_list_helper(ctx, is_message_id = undefined, ms = 0, action_text='') {
  const current_message_id = is_message_id || ctx.message?.message_id || ctx.callbackQuery?.message?.message_id;
  //console.log('Запущена функция построения списка show_list_helper.\n  db_data.last_list_message_id=',db_data.last_list_message_id,'\n  current_message_id=',current_message_id);
  try {
    if (!db_data.is_empty) {
      //убить предыдущую панель
      if (db_data.last_list_message_id && db_data.last_list_message_id != current_message_id) {
        kill_panel_helper(ctx);
       }
      await new Promise(r => setTimeout(r, ms));
      //сформировать массив элементов
      let elemets_arr = db_data.list.map((element, index)=>{
        let row = [];
        if (db_data.edit_mode) {
          row = [
            {text: '⬆', callback_data: `move_up ${index}`},
            {text: '🗑️ '+ element.value, callback_data: `kick ${index}`},
            {text: '✏️', callback_data: `edit ${index}`},
          ];
        } else {
          row = [{text: element.value, callback_data: `kick ${index}`}];
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
                {text: db_data.edit_mode ? '✅ ✏️' : '✏️', callback_data: 'edit_mode_action'},
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
     }
  } catch(err) {console.error('список не строится', err) }    
 }
//
async function kill_panel_helper(ctx, current_message_id = undefined) {
  try {
    if (db_data.last_list_message_id && current_message_id != db_data.last_list_message_id) {
      ctx.telegram.editMessageReplyMarkup(ctx.chat.id, db_data.last_list_message_id, undefined, {}).catch(err=>console.error('не нашел старых кнопок, чтобы их вычистить:\n',err.name));
     }
  } catch(err) { console.error('не смог очистить панель под сообщением:\n', err.name) }
 }
///--
//
///--part EDIT
bot.action('edit_mode_action', async (ctx) => {
  console.log('нажал режим "редактирования", было:', db_data.edit_mode);
  await db_data.toggle_edit_mode();
  ctx.answerCbQuery(db_data.edit_mode ? 'включен ✍️ режим редактирования' : 'режим редактирования ✏️ выключен');
  const action_text = db_data.edit_mode ? ' ✍️ режим редактирования' : ' 👇'; 
  show_list_helper(ctx, undefined, 0, action_text);
});
//

//Нажата кнопка (в режиме редактирования списка) - поднять элемент вверх
bot.action(/^move_up \d+/, async (ctx)=>{
  if (ctx.callbackQuery.message?.message_id == db_data.last_list_message_id) {
    //кнопка вызывает функцию move_up index, где index - номер элемента в актуальном списке.
    //получим этот индекс из названия функции кнопки:
    const index = Number(ctx.callbackQuery.data.slice(7));
    //получим значение элемента по индексу
    const element = db_data.list[index];
    console.log(`нажал поднять индекс №${index} "${element.value}"`);
    //в текущем списке есть куда двигаться, есть смысл заморачиваться?
    if (db_data.list.length > 1) {
      //обрабатываем запрос в данных
      await db_data.move_up(index);
      //перерисовываем список
      show_list_helper(ctx, undefined, 0, `"${element.value}" все выше ☝️`);
    }
  } else {
    ctx.answerCbQuery('🤷‍♂️ неактуальный список');
  }
});

bot.action(/^edit \d+/, async(ctx) =>{
  if (ctx.callbackQuery.message?.message_id == db_data.last_list_message_id) {
    const index = Number(ctx.callbackQuery.data.slice(4));
    const element = db_data.list[index];
    console.log(`нажал редактировать индекс №${index} "${element.value}"`);

    await ctx.telegram.editMessageText(
      ctx.chat.id, db_data.last_list_message_id, 0,
      `${escapeHtml(CHAT_NAME)}: ✏️ ...\n\n>> текущее значение: <s>${escapeHtml(element.value)}</s>\n>> введи новое значение:`,
      {
        parse_mode: 'html',
        reply_markup: {
        inline_keyboard: [[{text:'⬅ отмена', callback_data: 'show_action'}],]}
      }
    ).catch(err=>console.error('панель настроек для ввода нового имени не строится', err));
    await db_data.wait_for_value_at(index);
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
  if (!db_data.is_empty) {
    ctx.answerCbQuery('готово! 🖨 можно пересылать...');
    ctx.editMessageText(
      '<b>'+escapeHtml(CHAT_NAME)+'</b>:\n'+db_data.list.map((v,i)=>{return (i+1)+'. '+'<code>' + escapeHtml(v.value) + '</code>'}).join('\n'),
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
 }});
//
bot.command('print', async (ctx) => {
  console.log('ввел команду "/print"');
  db_data.wait_for_name(false);
  db_data.wait_for_value_at(undefined);
  kill_panel_helper(ctx);
  let current_message;
  //
  try {
    if (!db_data.is_empty) {
      current_message = await ctx.reply(
        '<b>'+escapeHtml(CHAT_NAME)+'</b>:\n' + db_data.list.map((v,i)=>{return (i+1)+'. '+'<code>' + escapeHtml(v.value) + '</code>'}).join('\n'),
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
     }
    db_data.set_last_list_message_id(current_message.message_id);
  } catch(err) {console.error('проблемы с выводом списка в сообщение (command(/print):\n', err); }
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
  db_data.wait_for_name(false);
  db_data.wait_for_value_at(undefined);
  kill_panel_helper(ctx);
  const {message_id} =  await ctx.reply(LOAD_EMJ, {reply_to_message_id: ctx.message?.message_id});
  db_data.set_last_list_message_id(message_id);
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
 }
///--
//
///--part KICK
bot.action('set_kick_mode_action', async (ctx) =>{
  //confirmation
  console.log('нажал "изменить режим"');
  await ctx.telegram.editMessageText(
    ctx.chat.id, ctx.callbackQuery.message?.message_id, 0,
    `⚙ Настройки: <b>режим удаления</b> - удалять элементы по нажатию или с подтверждением?\n\n( <b>easy</b> ) по нажатию - быстрый режим удаления элементов из списка\n( <b>confirmation</b> ) с подтвеждением - после каждого нажатия на элемент списка потребуется подтвердить удаление\n\n>> текущий режим: ( ${db_data.kick_mode ? db_data.kick_mode : 'easy'} )\n>> выбери режим:`,
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
     }
    await db_data.set_kick_mode(kick_mode);
  } catch (err) {console.error('не смог установить разделитель: ', err.name) }
  settings_panel_helper(ctx);
});
//
bot.action(/^kick \d+/, async (ctx) => {
  if (ctx.callbackQuery.message?.message_id == db_data.last_list_message_id) {
    const index = Number(ctx.callbackQuery.data.slice(5));
    console.log(`нажал на элемент в списке №${index} "${db_data.list[index].value}"`);
    if (db_data.kick_mode === 'easy' || !db_data.kick_mode) {
      await kick_helper(ctx, index);
    } else {
      console.log('непростой режим удаления, не изи: ', db_data.kick_mode);
      ctx.answerCbQuery((db_data.list[index].value.length > 182 ? db_data.list[index].value.slice(0,182).concat('...') : db_data.list[index].value).concat(' точно сделано?'))
      .catch(err=>console.error('не смог показать всплывашку в action(/^kick /):\n',err));
      //убедись, потом мочи
      await ctx.telegram.editMessageText(ctx.chat.id, ctx.callbackQuery.message?.message_id, 0,
        `✋ ${escapeHtml(CHAT_NAME)}: удалить "<b>${db_data.list[index].value}</b>" из списка?\n\n>> подтверди действие:`,
        {
          reply_markup: {
              inline_keyboard: [[{text:'⬅ отмена', callback_data: 'show_action'}, {text: "👍 сделано!", callback_data: `confirmed_kick_action ${index}`}]]
          },
          parse_mode: 'html',
          reply_to_message_id: ctx.message?.message_id,
        });
     }
  } else {
    ctx.answerCbQuery('🤷‍♂️ неактуальный список');
  }
});
//
bot.action(/^confirmed_kick_action /, async (ctx)=>{
  const index = Number(ctx.callbackQuery.data.slice(22));
  if (db_data.list[index]) {
    await kick_helper(ctx, index);
  } else {
    console.warn('(!!!) CTX:\n',ctx,'\n--------\nINDEX=',index);
  }
});
//
async function kick_helper(ctx, index) {
  const answer = (db_data.list[index].value.length > 184 ? db_data.list[index].value.slice(0,184).concat('...') : db_data.list[index].value).concat(' - сделано! 👍');
  await db_data.kick(index);
  ctx.answerCbQuery(answer).catch(err=>console.error('не смог показать всплывашку в kick_helper:\n', err));
  show_list_helper(ctx, db_data.last_list_message_id, 0, answer);
 }
///--
//
///--part SETTINGS
bot.action('settings', async (ctx) => {
  console.log('нажал "настройки"');
  db_data.wait_for_name(false);
  db_data.wait_for_value_at(undefined);
  settings_panel_helper(ctx);
});
//
bot.settings(async (ctx) => {
  console.log('ввел команду "/settings"');
  db_data.wait_for_name(false);
  db_data.wait_for_value_at(undefined);
  kill_panel_helper(ctx);
  const {message_id} =  await ctx.reply(LOAD_EMJ, {reply_to_message_id: ctx.message?.message_id});
  db_data.set_last_list_message_id(message_id);
  settings_panel_helper(ctx, message_id);
});
//
async function settings_panel_helper(ctx, is_message_id = undefined) {
  const current_message_id = is_message_id || ctx.message?.message_id || ctx.callbackQuery?.message?.message_id;
  console.log('Панель настроек');
  try {
    //убить предыдущий список
    if (current_message_id) {
      if (!db_data.is_empty && db_data.last_list_message_id && db_data.last_list_message_id != current_message_id) {
        ctx.telegram.editMessageText(
          ctx.chat.id, db_data.last_list_message_id, 0,
          db_data.list.map((v,i)=>{return (i+1)+'. '+'<code>'+escapeHtml(v.value)+'</code>'}).join('\n'), {parse_mode: 'html'})
        .catch(err=>console.error('не смог убить предыдущий список'));
       }
     }
    //обновить текущий список
    await ctx.telegram.editMessageText(ctx.chat.id, current_message_id, 0,
      '⚙ Настройки: <i>здесь приведены настройки работы списка</i>\n\n<b>имя</b> - изменить название списка\n\n<b>разделитель</b> - ввод нескольких значений за один раз\n\n<b>режим</b> - удалять элементы по нажатию или с подтверждением\n\n>> выбери действие:',
      {reply_markup: {
        inline_keyboard: [
          [ {text: `имя: ( ${escapeHtml(CHAT_NAME)} )`, callback_data: 'set_list_name_action'}],
          [ {text: `разделитель: ( ${db_data.delimiter === '\n' ? '⏎' : db_data.delimiter} )`, callback_data: 'set_delimit_action'}],
          [ {text: `режим: ( ${db_data.kick_mode ? db_data.kick_mode : 'easy'} )`, callback_data: 'set_kick_mode_action'}],
          [ {text:'⬅ к списку', callback_data: 'show_action'} ],
        ]},
        parse_mode: 'html'
      }
    ).catch(err=>console.error('что-то не так с построением меню настроек: ', err.name));
  } catch(err) {console.error('панель настроек не строится', err) }    
 }
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
  await db_data.wait_for_name(true);
});
//
///--delimiter actions
bot.action('set_delimit_action', async (ctx)=> {
  console.log('нажал "разделитель"');
  await ctx.telegram.editMessageText(
    ctx.chat.id, ctx.callbackQuery.message?.message_id, 0,
    `⚙ Настройки: режим ввода значений списка через разделитель...\n\nЕсли разделитель задан, можно вводить несколько значений за один раз. Например, ввод: "хлеб, лук, масло" без разделителя будет записан в одну строку списка. Если же выбрать разделитель "запятая", то список пополнится каждым значением отдельно: "хлеб", "лук" и "масло".\n\n>> текущий разделитель: ( ${db_data.delimiter === '\n' ? '⏎' : db_data.delimiter} )\n>> выбери разделитель:`,
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
     }
    await db_data.set_delimiter(delimiter);
  } catch (err) {console.error('не смог установить разделитель: ', err.name) }

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
  await db_data.clear_list();
  ctx.editMessageText('<b>'+escapeHtml(CHAT_NAME)+'</b>: 🤲 <i>список очищен!</i>', {reply_markup: HELP_BTN, parse_mode: 'html'})
  .catch(err=>console.error('ошибка в confirmed_clear_action:\n',err));
});
// очистить список
bot.command('clear', async (ctx) => {
  console.log('ввел команду "/clear"');
  db_data.wait_for_name(false);
  db_data.wait_for_value_at(undefined);
  kill_panel_helper(ctx);
  const {message_id} =  await ctx.reply(LOAD_EMJ, {reply_to_message_id: ctx.message?.message_id});
  db_data.set_last_list_message_id(message_id);
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
 }
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
  const answer = await db_data.insert(sticker_value) ? `"${sticker_value}" добавлено 👍` : `🤷‍♂️ "${sticker_value}" уже было в списке`;

  const {message_id} =  await ctx.reply('...', {reply_to_message_id: ctx.message?.message_id});
  db_data.set_last_list_message_id(message_id);
  show_list_helper(ctx, message_id, 0, answer);
});
//
///--текстовые сообщения
bot.on(message('text'), async (ctx) => {
  const text = ctx.message?.text;
  kill_panel_helper(ctx);
  //console.log(`в ${JSON.stringify(ctx.chat,null,1)} написал сообщение: "${text}"`);
  try {
    //обработка редактирования существующего элемента
    if (db_data.wait_for_value_index && db_data.wait_for_value_index >= 0) {
      console.log('обработка редактирования существующего элемента');
      const answer = await db_data.update_value_at_wait_for_value_index(text) ? `"${text}" изменено 👍` : `🤷‍♂️ "${text}" уже было в списке`;
      const { message_id } = await ctx.reply('...✍...', {reply_to_message_id: ctx.message?.message_id});
      db_data.set_last_list_message_id(message_id);
      db_data.wait_for_value_at(undefined);
      return show_list_helper(ctx, message_id, 0, answer);
    //обработка ввода нового имени списка чата
    } else if (db_data.list_name.wait_for_name) {
      const list_name25 = text.slice(0, 25);
      await db_data.set_list_name(list_name25);
      CHAT_NAME = list_name25;
      await db_data.wait_for_name(false);
      const { message_id } = await ctx.reply('...👍...', {reply_to_message_id: ctx.message?.message_id});
      await db_data.set_last_list_message_id(message_id);
      return settings_panel_helper(ctx, message_id);
    //в групповых чатах отвечать только на команды и прямые обращения (на @_ и @имя_бота_)
    //type of chat, can be either “private”, “group”, “supergroup” or “channel”
    } else if (ctx.chat.type != 'private') {
      let answer;
      const a = text.slice(0,process.env.BOT_NAME.length + 2);
      const b = `@${process.env.BOT_NAME} `;
      const r = a === b;

      //@TODO: HTML_escape?
      if (text.slice(0,2) === '@ ') { 
        answer = text.slice(2);
      } else if (text.slice(0,process.env.BOT_NAME.length + 2) === `@${process.env.BOT_NAME} `) {
          answer = text.slice(process.env.BOT_NAME.length + 2)
      }

      if (answer) {
        if (answer.slice(0,1) === '/') {
          //команда в групповом чате. игнор с поучением
          const { message_id } = await ctx.reply(`если хочешь задать мне команду, попробуй воспользоваться меню ( / ) или запиши в другом порядке: ${answer}@${process.env.BOT_NAME}`);
          return db_data.set_last_list_message_id(message_id);
        } else {
          console.log('обращение в групповом чате, пишем: ',answer);
          answer = await db_data.insert(answer) ? `"${answer}" добавлено 👍` : `🤷‍♂️ "${answer}" уже было в списке`;
          const { message_id } = await ctx.reply('...✍...', {reply_to_message_id: ctx.message?.message_id});
          await db_data.set_last_list_message_id(message_id);
          return show_list_helper(ctx, message_id, 0, answer);
         }
      } else {
        console.log('общение в групповом чате, не подслушиавем...');
      }
    //любоЕ слово попадает в список, кроме ключевых слов выше, кроме команд и спец. символов
    } else if ((/[^\/]/).test(text[0])) {
      const res = await db_data.insert(text);
      const answer = res ? `"${text}" добавлено 👍` : `🤷‍♂️ "${text}" уже было в списке`;
      console.log(`${answer}`);
      const { message_id } = await ctx.reply('...✍...', {reply_to_message_id: ctx.message?.message_id});
      await db_data.set_last_list_message_id(message_id);
      return show_list_helper(ctx, message_id, 0, answer);
    //все остальное написанное - непонятно
    } else {
      const { message_id } = await ctx.reply(`незнакомая команда 🤷‍♂️`, {reply_to_message_id: ctx.message?.message_id} );
      return await db_data.set_last_list_message_id(message_id);
    }
  } catch(err) { console.error('проблема с обработкой введеного текста',err);  }
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
  console.log('Работа завершена.');
  bot.stop('SIGTERM');
});