require('dotenv').config({ path: `${process.env.NODE_ENV}.env` });
//const { readFileSync } = require('fs');
const { readFile, writeFile } = require('fs/promises');

//      Хранилка реализована на файлах в папке storage
//      каждый чат - отдельный файл

module.exports = class Chat_data_in_files {

    static file_path(chat_id) {
        return process.env.STORAGE_LOCATION + '/' + chat_id + '.json';
    };

    constructor(chat_id, data) { 
        this.id = chat_id;
        this.list = [];
        this.list_name = {};

        if (typeof data === 'undefined') {
            console.warn('данных из файла (',Chat_data_in_files.file_path(chat_id),') нет, инициализируем пустышку');
        } else {
            //console.log('получил из файла в конструктор: \n',data)
            try {
                //@TODO: читать объекты красиво!
                const parsed_data = JSON.parse(data);
                this.list = parsed_data.list;
                this.last_list_message_id = parsed_data.last_list_message_id;
                const list_name_from_data = parsed_data.list_name;
                if ( list_name_from_data && Object.keys(list_name_from_data).length > 0) {
                    this.list_name = list_name_from_data;
                } else {this.list_name = {name: 'Список', wait_for_name: false}};
            } catch(err) {
                console.error(err.name,': ошибка файла (',Chat_data_in_files.file_path(chat_id),')')
            };
        };
    };

    static async init(chat_id) {
        const async_data = await readFile(Chat_data_in_files.file_path(chat_id));
        return new Chat_data_in_files(chat_id, async_data);
    }

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
        //console.log('начинаю писать в файл UPDATE data\n','THIS=',JSON.stringify(this,null,1));
        writeFile(Chat_data_in_files.file_path(this.id), JSON.stringify({id: this.id, list: this.list, last_list_message_id: this.last_list_message_id, list_name: this.list_name}), { encoding: 'utf-8' })
        .catch(err=>console.error(err.name,': ошибка записи в файл (',Chat_data_in_files.file_path(chat_id),')'));  
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
