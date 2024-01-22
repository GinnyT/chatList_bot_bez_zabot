/*
@TODO: 
  //узнать, как толкать пуши, как в answerCallbackQuery!
  //в bot.start проверять, есть ли список, если есть, выводить
*/


require('dotenv').config();
//const Chat = require('./chat_data');          //данные в Global
const DATA = require('./chat_data_in_files'); //данные в файле
const { Telegraf, Markup } = require('telegraf');
const { message } = require('telegraf/filters')
const bot = new Telegraf(process.env.TOKEN);

//глобальные переменные и константы
let counter = 0;
//let chat = {}; //объявляется в bot.use т.к. зависит от конкретного чата
let data = {};

const SHOP_BTN = {inline_keyboard: [[{text: "Шопить", callback_data: 'shop'}]]};
const HELP_BTN = {inline_keyboard: [[{text: "помощь", callback_data: 'help'}]]};
const LOAD_EMJ = '\u{1F90C}';
const SHOP_N_HELP_BTN = {inline_keyboard: [[
  {text: "Шопить", callback_data: 'shop'},
  {text: "Помощь", callback_data: 'help'}]
]};
const CHAT_NAME = 'Список'


//оболочка обработки каждого сообщения
bot.use(async (ctx, next) => {
  const start_time = new Date();
  console.log(`---------------\n${counter++}) прилетело из чата: ${ctx.chat.id} от ${ctx.from.username} тип: ${ctx.updateType}`);
  
  data = new DATA(ctx.chat.id);
  
  await next();
  
  await data.update();

  const ms = new Date() - start_time;
  console.log(`---------------время обработки: ${ms}`);
})

//                  Команды по приоритетам
// команда на старт
bot.start(async (ctx) => {
  console.log('ввел команду "/start"');
  await start(ctx);
});

/* // выход из чата
bot.command('quit', async (ctx) => {
  try {
    await ctx.leaveChat();
    ctx.reply('пользователь покинул чат');
  }  catch(err) {
    console.error(`ошибка обработки: ${ctx.updateType}`, err);
    ctx.reply('нельзя покинуть приватный чат');
  };
}); */

//TODO: БАГ! написал в чате и вышщиб систему
// показать список 
bot.command('shop', async (ctx) => {
  console.log('ввел команду "/shop"');
  const {message_id} =  await ctx.reply(LOAD_EMJ, {reply_to_message_id: ctx.message?.message_id});
  shop_list(ctx, message_id, 0, '👇 текущий');
});

// очистить список
bot.command('clear', async (ctx) => {
  console.log('ввел команду "/clear"');
  const {message_id} =  await ctx.reply(LOAD_EMJ, {reply_to_message_id: ctx.message?.message_id});
  clear_list(ctx, message_id);
});

//показать помощь
bot.help(async (ctx) => {
  console.log('ввел команду "/help"');
  const {message_id} =  await ctx.reply(LOAD_EMJ, {reply_to_message_id: ctx.message?.message_id});
  help(ctx, message_id);
});

//                Функции обработки
//@TODO:
//  если есть список, покажи сразу

async function shop_list(ctx, is_message_id = undefined, ms = 0, action_text='') {
  
  const current_message_id = is_message_id || ctx.message?.message_id || ctx.callbackQuery?.message?.message_id;

  console.log('Запущена функция построения списка shop_list.\n data.current_shop_list=',data.current_shop_list,'\ncurrent_message_id=',current_message_id);
  
  try {
    if (!data.is_empty) {
      //убить предыдущий список
      if (current_message_id) {
        if (data.current_shop_list && data.current_shop_list != current_message_id) {
          ctx.telegram.editMessageText(ctx.chat.id, data.current_shop_list, 0, data.list_str)
          .catch(err=>console.error('не смог убить предыдущий список'));
        };
        //
        data.set_current_shop_list(current_message_id);
      };

      await new Promise(r => setTimeout(r, ms));
      //обновить текущий список
      await ctx.telegram.editMessageText(ctx.chat.id, current_message_id, 0, CHAT_NAME+': <code>'+action_text+'</code>',
        {
          reply_markup: {
              inline_keyboard: data.list.map((element, index)=>{return [{text: element, callback_data: `kick ${index}`}]})
              .concat([[{text: "📛 очистить", callback_data: 'clear'},{text: "⚙", callback_data: 'settings'}, {text: "🖨 вывести", callback_data: 'print'}, ]])
          },
          parse_mode: 'html',
          reply_to_message_id: ctx.message?.message_id,
        });
    } else {
      await ctx.telegram.editMessageText(ctx.chat.id, current_message_id, 0, '🤷‍♂️ текущий список пуст', {reply_markup: HELP_BTN, reply_to_message_id: ctx.message?.message_id});
    };
  } catch(err) {console.error('список не строится', err)};    
  
};

async function help(ctx, is_message_id = undefined, ms = 0) {
  const current_message_id = is_message_id || ctx.message?.message_id || ctx.callbackQuery?.message?.message_id;
  
  await new Promise(r => setTimeout(r, ms));
  
  ctx.telegram.editMessageText(ctx.chat.id, current_message_id, 0, 'Как здесь все работает⁉ 🤨 Просто...\n\nПРОСТО\n🔲 1. напиши пару слов,\nИЛИ 🤔 занеси дело в ToDo-лист,\nИЛИ 🤓 накидай список покупок,\nИЛИ 🛫 запиши важную мелочь, чтобы не забыть в дорогу. \n\n🔲 2. Когда придет время, открой список 👇 (/shop)\n\n🔲 3. Сделай \u{1FAF5} что-то из списка и ткни в пункт.\nОн исчезнет 👍\n\n 👉 ✍ 👇Пиши же:', {reply_to_message_id: current_message_id}).catch(err=>console.error('/help не смог помочь, споткнулся: ', err.name));
};

async function clear_list(ctx) {
  await data.clear_list();
  ctx.editMessageText('🤲 список очищен!', {reply_markup: HELP_BTN});
}

async function start(ctx) {
  await ctx.reply('Привет! 👋\nПомочь или сразу к делу? 👇✍', {/*reply_markup: HELP_BTN,  */ reply_to_message_id: ctx.message?.message_id} )
  .catch((err)=>{console.error('кнока ух', err)});
  const {message_id} = await ctx.reply('🤔');
  shop_list(ctx, message_id, 0, 'с возвращением\\! 😘');
}

//            Обработка кнопок

/* bot.action('shop', async (ctx) => {
  console.log('нажал "шопить"');
  await shop_list(ctx);
}); */

bot.action('clear', async (ctx) => {
  console.log('нажал "очистить"');
  await clear_list(ctx);
});

bot.action('start', async (ctx) => {
  console.log('нажал "сначала"');
  await start(ctx);
});

bot.action('help', async (ctx) => {
  console.log('нажал "помощь"');
  await help(ctx);
});

bot.action('print', async (ctx) => {
  console.log('нажал "вывести"');
  //
  if (!data.is_empty) {
    ctx.answerCbQuery('готово! 🖨 можно пересылать...');
  
    ctx.reply(CHAT_NAME+':\n'+data.list.map((v,i)=>{return (i+1)+') '+'<code>'+v+'</code>'}).join('\n'), {parse_mode: 'html'})
    .catch(err=>console.error('проблемы с выводом списка в сообщение', err));
  
  } else {
    ctx.answerCbQuery('🤷‍♂️ текущий список пуст...', true);
  };
});

//ответ на стикеры
bot.on(message('sticker'), async (ctx) => {
  const {message_id} =  await ctx.reply('...😱...', {reply_to_message_id: ctx.message?.message_id});
  //@TODO: здесь надо убить прошлый список, превратив его в list_str
  shop_list(ctx, message_id, 0, '🤚 стикеры не заношу...');
});

/* //ответ на ключевые слова
bot.hears('/[^\/\@\#]', async (ctx) => {
  const { message_id } = await ctx.reply('🤷‍♂️ незнакомая команда', {reply_to_message_id: ctx.message?.message_id} );
  await shop_list(ctx, message_id, 1000);
}); */

//обработка текстового сообщения: любоЕ слово попадает в список, кроме ключевых слов выше, кроме команд и спец символов
bot.on(message('text'), async (ctx) => {
  const text = ctx.message?.text;
  console.log(`написал сообщение: "${text}"`);
  try {
    ///[^\._\-\/\*\(\)]/  /[a-zA-Zа-яА-Я0-9.-+]/
    if ((/[^\/\@]/).test(text[0])) {
      const answer = await data.insert(text) ? `"${text}" добавлено 👍` : `🤷‍♂️ "${text}" уже было в списке`;
      //сделать оралку типа answerCbQuery
      const { message_id } = await ctx.reply(answer + '...', {reply_to_message_id: ctx.message?.message_id});
      shop_list(ctx, message_id, 0, answer);
    } else {
      const { message_id } = await ctx.reply(`🤷‍♂️ незнакомая команда`, {reply_to_message_id: ctx.message?.message_id} );
    };
  }catch(err) { console.error('проблема с обработкой введеного текста',err); };
});

//кнопочки списка 
//@TODO:
  //заменить на подходящую, например {  }
  //проверить на синхронность

bot.on("callback_query", async (ctx)=>{
  //проверяем команду и проверяем, чтобы кнопка была нажата в текущем списке, иначе можно по индексу массива удалить не то значение
  if (ctx.callbackQuery.data.slice(0,4) == 'kick' && ctx.callbackQuery.message?.message_id == data.current_shop_list) {
    const index = Number(ctx.callbackQuery.data.slice(5));
    let item = data.list[index];
    console.log(`нажал на элемент в списке №${index} "${item}"`);
    //@TODO! надо дополнительно проверить удаляемый элемент!
    if (index > -1) {
      await data.kick(index);
      await shop_list(ctx, data.current_shop_list, 0, `"${item}" - сделано 💪`);
      ctx.answerCbQuery(item ? `${item} - сделано! 👌` : '🤷‍♂️ не нашел в текущем списке:');
    };

    //если ничего не осталось:
    if (data.is_empty) {
        ctx.answerCbQuery('🤷‍♂️ текущий список пуст', true);
        ctx.editMessageText('🤷‍♂️ текущий список пуст', {reply_markup: HELP_BTN});
    };
  };

});

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