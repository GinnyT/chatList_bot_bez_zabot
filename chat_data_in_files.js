/*@TODO 
синхронная работа с файлами - это большое зло на NODE JS
но победить работу асинхронных функций со свойствами класса я пока не смог 
*/

require('dotenv').config();
const { readFileSync } = require('fs');
const { readFile, writeFile } = require('fs/promises');

const location = process.env.STORAGE_LOCATION;

//      Хранилка реализована на файлах в папке storage
//      каждый чат - отдельный файл

module.exports = class Chat_data_in_files {
    id;
    list = []; 
    file_path = '';
    last_list_message_id;
    list_name = {};

    constructor(chat_id) {
        this.id = chat_id;
        this.file_path = location + '/' + chat_id + '.json';

        try {
            const data = readFileSync(this.file_path);
            this.list = JSON.parse(data).list;
            this.last_list_message_id = JSON.parse(data).last_list_message_id;
            const list_name_from_data = JSON.parse(data).list_name;
            if ( list_name_from_data && Object.keys(list_name_from_data).length > 0) {
                this.list_name = list_name_from_data;
            } else {this.list_name = {name: 'Список', wait_for_name: false}};
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

    kick(index) {
        this.list.splice(index, 1);
    };

    async clear_list() {
        this.list = [];
    };

    async update() {
        //@TODO: нужны ли проверки, чтобы лишний раз не травмировать диск?
        console.log('начинаю писать в файл UPDATE data\n','THIS=',JSON.stringify(this,null,1));
        writeFile(this.file_path, JSON.stringify({id: this.id, list: this.list, last_list_message_id: this.last_list_message_id, list_name: this.list_name}), { encoding: 'utf-8' });  
    };

    async set_last_list_message_id(message_id) {
        if (message_id) {
            //console.log('список установлен set_last_list_message_id(message_id):\n',message_id);
            this.last_list_message_id = message_id;
        };
    };

    async wait_for_name(flag = false) {
        this.list_name.wait_for_name = flag;
    };

    async set_list_name(name) {
        if (name) {
            this.list_name.name = name.slice(0,15);
        };
    };
    
};
