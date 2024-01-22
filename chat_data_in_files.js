/*@TODO 
синхронная работа с файлами - это большое зло на NODE JS
но победить работу асинхронных функций со свойствами класса я пока не смог 
*/

require('dotenv').config();
const { readFileSync } = require('fs');
const { writeFile } = require('fs/promises');
const location = process.env.STORAGE_LOCATION;

//      Хранилка реализована на файлах в папке storage
//      каждый чат - отдельный файл

module.exports = class Chat_data_in_files {
    id;
    list = []; 
    file_path = '';
    current_shop_list;

    constructor(chat_id) {
        this.id = chat_id;
        this.file_path = location + '/' + chat_id + '.json';
        try {
            const data = readFileSync(this.file_path);
            this.list = JSON.parse(data).list;
            this.current_shop_list = JSON.parse(data).current_shop_list;
        } catch(err) {
            console.error(err.name,': ошибка файла (',this.file_path,')')
        }
    };

    get is_empty() {
        return this.list.length == 0;
    };

    insert(value) {
        const element = value.toLowerCase();
        if (this.list.indexOf(element) === -1) {
            this.list.push(element);
            //console.log(`занесли пока в память "${element}"`);
            return element;
        } else {return undefined}
    };

    get list_str() {
        return this.list.map((v,i)=>{return (i+1)+') '+'<code>'+v+'</code>'}).join('\n'); //<code>
    };

    kick(index) {
        this.list.splice(index, 1);
    };

    async clear_list() {
        this.list = [];
    };

    async update() {
        //@TODO: нужны ли проверки, чтобы лишний раз не травмировать диск?
        //console.log('начинаю писать в файл UPDATE data\n',{id: this.id, current_shop_list: this.current_shop_list, list: this.list});
        writeFile(this.file_path, JSON.stringify({id: this.id, list: this.list, current_shop_list: this.current_shop_list}), { encoding: 'utf-8' });  
        //console.log('выполнен UPDATE data\n',{id: this.id, current_shop_list: this.current_shop_list, list: this.list});
    };

    async set_current_shop_list(message_id) {
        if (message_id) {
            //console.log('список установлен set_current_shop_list(message_id):\n',message_id);
            this.current_shop_list = message_id;
        };
    };
};
