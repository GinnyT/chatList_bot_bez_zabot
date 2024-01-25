require('dotenv').config({ path: `${process.env.NODE_ENV}.env` });

//const Chat = require('./chat_data');          //данные в Global
const DATA = require('./chat_data_in_files'); //данные в файле
const { Telegraf } = require('telegraf');
const { message } = require('telegraf/filters');
//@TODO: не нашел простой способ вызвать единожды асинхронную функцию getMe() так, чтобы получить актуальное имя бота, но не грузить запросом каждый вызов внутри use. 
//пока решил зашить в окружение
const bot = new Telegraf(process.env.TOKEN);
console.log('Стартует бот: ',process.env.USER_NAME)

//глобальные переменные и константы
//@TODO: рефакторить - вынести в хелперы
let counter = 0;
let data = {};

let CHAT_NAME = 'Список';
const LIST_BTN = {inline_keyboard: [[{text: CHAT_NAME, callback_data: 'list'}]]};
const HELP_BTN = {inline_keyboard: [[{text: "помощь", callback_data: 'help'}]]};
const LIST_N_HELP_BTN = {inline_keyboard: [[LIST_BTN.inline_keyboard[0][0], HELP_BTN.inline_keyboard[0][0]]]}
const LOAD_EMJ = '\u{1F90C}';

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

  await ctx.reply('Привет! 👋 Помочь или сразу к делу? 👇✍', {reply_to_message_id: ctx.message?.message_id} )
  .catch(err=>console.error(err));

  const {message_id} = await ctx.reply('🤔');
  show_list(ctx, message_id, 0, '<i>старый список найден!</i> С возвращением! 😘');
});

// показать список 
bot.command('list', async (ctx) => {
  console.log('ввел команду "/list"');
  data.wait_for_name(false);

  const {message_id} =  await ctx.reply(LOAD_EMJ, {reply_to_message_id: ctx.message?.message_id});
  show_list(ctx, message_id, 0, '👇 <i>текущий</i>');
});

// очистить список
bot.command('clear', async (ctx) => {
  console.log('ввел команду "/clear"');
  data.wait_for_name(false);

  const {message_id} =  await ctx.reply(LOAD_EMJ, {reply_to_message_id: ctx.message?.message_id});
  clear_list(ctx, message_id);
});

//показать помощь
bot.help(async (ctx) => {
  console.log('ввел команду "/help"');
  data.wait_for_name(false);

  const {message_id} =  await ctx.reply(LOAD_EMJ, {reply_to_message_id: ctx.message?.message_id});
  help(ctx, message_id);
});

//вывести список на печать
bot.command('print', async (ctx) => {
  console.log('ввел команду "/print"');
  data.wait_for_name(false);
  //
  if (!data.is_empty) {
    ctx.reply(escapeHtml(CHAT_NAME) + ':\n' + data.list.map((v,i)=>{return (i+1)+'. '+'<code>' + escapeHtml(v) + '</code>'}).join('\n'),
    {reply_to_message_id: ctx.message?.message_id, parse_mode: 'html'})
    .catch(err=>console.error('проблемы с выводом списка в сообщение', err));
  } else {
    ctx.reply(escapeHtml(CHAT_NAME) + ': 🤷‍♂️ <i>текущий список пуст</i>', {reply_markup: HELP_BTN, reply_to_message_id: ctx.message?.message_id, parse_mode: 'html'});
  };

});

//настройки
bot.settings(async (ctx) => {
  console.log('ввел команду "/settings"');
  data.wait_for_name(false);
  
  const {message_id} =  await ctx.reply(LOAD_EMJ, {reply_to_message_id: ctx.message?.message_id});
  settings_panel(ctx, message_id);
});

//                ФУНКЦИИ. ОБРАБОТКА. Повторяемый код

async function show_list(ctx, is_message_id = undefined, ms = 0, action_text='') {
  const current_message_id = is_message_id || ctx.message?.message_id || ctx.callbackQuery?.message?.message_id;
  console.log('Запущена функция построения списка show_list.\n data.last_list_message_id=',data.last_list_message_id,'\ncurrent_message_id=',current_message_id);
  try {
    if (!data.is_empty) {
      //убить предыдущий список
      if (current_message_id) {
        if (data.last_list_message_id && data.last_list_message_id != current_message_id) {
          ctx.telegram.editMessageText(ctx.chat.id, data.last_list_message_id, 0,
            data.list.map((v,i)=>{return (i+1) + '. ' + '<code>' + escapeHtml(v) + '</code>'}).join('\n'),
            {parse_mode: 'html'})
          .catch(err=>console.error('не смог убить предыдущий список'));
        };
        //
        data.set_last_list_message_id(current_message_id);
      };

      await new Promise(r => setTimeout(r, ms));
      //обновить текущий список
      await ctx.telegram.editMessageText(ctx.chat.id, current_message_id, 0,
        escapeHtml(CHAT_NAME) + ': '+escapeHtml(action_text),
        {
          reply_markup: {
              inline_keyboard: data.list.map((element, index)=>{return [{text: element, callback_data: `kick ${index}`}]})
              .concat([[{text: "📛 очистить", callback_data: 'clear'},{text: "⚙", callback_data: 'settings'}, {text: "🖨 вывести", callback_data: 'print'}, ]])
          },
          parse_mode: 'html',
          reply_to_message_id: ctx.message?.message_id,
        });
    } else {
      await ctx.telegram.editMessageText(ctx.chat.id, current_message_id, 0,
        escapeHtml(CHAT_NAME) + ': 🤷‍♂️ <i>текущий список пуст</i>',
        {reply_markup: HELP_BTN, reply_to_message_id: ctx.message?.message_id, parse_mode: 'html'});
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
  await data.clear_list();
  await new Promise(r => setTimeout(r, ms));
  //ctx.answerCbQuery('🤲 список очищен!');
  ctx.telegram.editMessageText(ctx.chat.id, current_message_id, 0, escapeHtml(CHAT_NAME) + ': 🤲 <i>список очищен!</i>', {reply_markup: HELP_BTN, parse_mode: 'html'});
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
      //
      data.set_last_list_message_id(current_message_id);
    };

    //обновить текущий список
    await ctx.telegram.editMessageText(ctx.chat.id, current_message_id, 0, '⚙ Настройки:',
      {reply_markup: {
        inline_keyboard: [
          [ {text: "ИМЯ: ("+CHAT_NAME+")", callback_data: 'set_list_name'},
            {text: "РАЗДЕЛИТЕЛЬ: (null)", callback_data: 'set_delimit'},],
          [
            {text: "РЕЖИМ: (сразу)", callback_data: 'done_mode'}
          ],
          [
            {text:'⬅ К СПИСКУ', callback_data: 'close_settings'}
          ],
    ]}});
  } catch(err) {console.error('панель настроек не строится', err)};    
};

//            КНОПКИ. ответы на CallBackQuery

bot.action('set_list_name', async (ctx)=>{
  console.log('нажал "изменить имя"');
  await ctx.reply('Введи новое имя для "' + escapeHtml(CHAT_NAME) + '" (<i>до 15 символов</i>):',{parse_mode:'html'});
  data.wait_for_name(true);
});

bot.action('close_settings', async (ctx)=>{show_list(ctx)});

bot.action('clear', async (ctx) => {
  console.log('нажал "очистить"');
  clear_list(ctx);
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
    ctx.reply(escapeHtml(CHAT_NAME) + ':\n'+data.list.map((v,i)=>{return (i+1)+'. '+'<code>' + escapeHtml(v) + '</code>'}).join('\n'), {parse_mode: 'html'})
    .catch(err=>console.error('проблемы с выводом списка в сообщение', err));
  } else {
    ctx.answerCbQuery(CHAT_NAME+': 🤷‍♂️ текущий список пуст...');
  };
});

bot.action('settings', async (ctx) => {
  console.log('нажал "настройки"');
  settings_panel(ctx);
  //ctx.reply('/settings');
});

bot.on('callback_query', async (ctx)=>{
  //проверяем команду и проверяем, чтобы кнопка была нажата в текущем списке, иначе можно по индексу массива удалить не то значение
  if (ctx.callbackQuery.data.slice(0,4) == 'kick' && ctx.callbackQuery.message?.message_id == data.last_list_message_id) {
    const index = Number(ctx.callbackQuery.data.slice(5));
    let item = data.list[index];
    console.log(`нажал на элемент в списке №${index} "${item}"`);
    if (index > -1) {
      await data.kick(index);
      await show_list(ctx, data.last_list_message_id, 0, `"<b>${item}</b>" - сделано 💪`);
      ctx.answerCbQuery(item ? `${item} - сделано! 👌` : '🤷‍♂️ не нашел в текущем списке');
    };
    //если ничего не осталось:
    if (data.is_empty) {
        ctx.answerCbQuery('🤷‍♂️ текущий список пуст');
        ctx.editMessageText(escapeHtml(CHAT_NAME) + ': 🤷‍♂️ <i>текущий список пуст</i>', {reply_markup: HELP_BTN, parse_mode: 'html'});
    };
  } else if (ctx.callbackQuery.message?.message_id != data.last_list_message_id) {
    ctx.answerCbQuery('🤷‍♂️ неактуальный список');
  };
});

/* bot.on('inline_query', async (ctx) => {
  console.log('INLINE QUERY:', inlineQuery);
  ctx.answerInlineQuery('YOHUUU!')
}); */

//            Ответы на СООБЩЕНИЯ
//ответ на стикеры
bot.on(message('sticker'), async (ctx) => {
  const sticker_value = 'стикер: '+ ctx.message.sticker.set_name +': '+ ctx.message.sticker.emoji;
  //console.log('STIKER!\n'+JSON.stringify(ctx.message,null,1));
  console.log('STIKER!\n'+sticker_value);

  const answer = await data.insert(sticker_value) ? `"<b>${sticker_value}</b>" добавлено 👍` : `🤷‍♂️ "<b>${sticker_value}</b>" уже было в списке`;

  const {message_id} =  await ctx.reply('😱', {reply_to_message_id: ctx.message?.message_id});
  show_list(ctx, message_id, 0, answer);
});

//для групповых чатов реагируем только, если нас спрашивают
/* bot.hears( `@${process.env.USER_NAME}`, async (ctx)=>{
  console.log('пустая собака или имя бота:\n',JSON.stringify(ctx.message,null,1));
}); */

//обработка текстового сообщения:
bot.on(message('text'), async (ctx) => {
  const text = ctx.message?.text;

  console.log(`в ${JSON.stringify(ctx.chat,null,1)} написал сообщение: "${text}"`);

  try {
    //обработка ввода нового имени списка чата
    if (data.list_name.wait_for_name) {
      const list_name15 = text.slice(0, 15);
      await data.set_list_name(list_name15);
      CHAT_NAME = list_name15;
      data.wait_for_name(false);
      const { message_id } = await ctx.reply('👍', {reply_to_message_id: ctx.message?.message_id});
      return settings_panel(ctx, message_id);

    //в групповых чатах отвечать только на команды и прямые обращения (на @_ и @имя_бота_)
    } else if (ctx.chat.type != 'private') {
      let answer;
      //@TODO: HTML_escape
      if (text.slice(0,2) === '@ ') { 
        answer = text.slice(2);
      } else if (text.slice(0,process.env.USER_NAME.length+1) === `@${process.env.USER_NAME}`) {
        answer = text.slice(process.env.USER_NAME.length + 1)
      };

      if (answer) {
        console.log('обращение в групповом чате, пишем: ',answer);
        answer = await data.insert(answer) ? `"<b>${answer}</b>" добавлено 👍` : `🤷‍♂️ "<b>${answer}</b>" уже было в списке`;
        const { message_id } = await ctx.reply('✍', {reply_to_message_id: ctx.message?.message_id});
        return show_list(ctx, message_id, 0, answer);
      } else {
        console.log('общение в групповом чате, не подслушиавем...');
      };

    //любоЕ слово попадает в список, кроме ключевых слов выше, кроме команд и спец. символов
    } else if ((/[^\/]/).test(text[0])) {
      

      const answer = escapeHtml(await data.insert(text)) ? `"<b>${text}</b>" добавлено 👍` : `🤷‍♂️ "<b>${text}</b>" уже было в списке`;
      const { message_id } = await ctx.reply('✍', {reply_to_message_id: ctx.message?.message_id});
      return show_list(ctx, message_id, 0, answer);
    
    //все остальное написанное - непонятно
    } else {
      const { message_id } = await ctx.reply(`🤷‍♂️ незнакомая команда`, {reply_to_message_id: ctx.message?.message_id} );
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