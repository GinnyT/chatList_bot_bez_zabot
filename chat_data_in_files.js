require('dotenv').config({ path: `${process.env.NODE_ENV}.env` });
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
        this.list_name = {name: 'Список', wait_for_name: false};
        this.delimiter = undefined;
        this.kick_mode = 'easy';

        if (typeof data === 'undefined') {
            console.warn('нет данных из файла (',Chat_data_in_files.file_path(chat_id),'), инициализируем пустышку');
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
                };
                this.delimiter = parsed_data.delimiter;
                this.kick_mode = parsed_data.kick_mode;
            } catch(err) {
                console.error('ошибка файла (',Chat_data_in_files.file_path(chat_id),'):\n', err.name);
            };
        };
    };

    static async init(chat_id) {
        const async_data = await readFile(Chat_data_in_files.file_path(chat_id)).catch(err=>console.error('ошибка чтения файла:\n',err.name));
        return new Chat_data_in_files(chat_id, async_data);
    }

    get is_empty() {
        return this.list.length == 0;
    };

    #insert_value(v){
        if (v && v.trim() != '') {
            const element = v.toLowerCase().trim();
            if (this.list.indexOf(element) === -1) {
                this.list.push(element);
                //console.log(`занесли пока в память "${element}"`);
                return element;
            } else {
                return undefined
            };
        };
    };

    insert(value) {
        //@TODO: добавить информацию о том, кто внес данные - для групповых чатов
        //value == {"element = '<string>', from = {}"}

        if (this.delimiter) {
            let last = undefined;
            value.split(this.delimiter).forEach((v)=>{
                const iter = this.#insert_value(v);
                last = iter ? iter : last; 
            });
            return last;
        } else {
            return this.#insert_value(value);
        };
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
        writeFile(Chat_data_in_files.file_path(this.id), JSON.stringify({id: this.id, list: this.list, last_list_message_id: this.last_list_message_id, list_name: this.list_name, delimiter: this.delimiter, kick_mode: this.kick_mode}), { encoding: 'utf-8' })
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
    
async set_delimiter(delimiter) {
        this.delimiter = delimiter;
    };

    async set_kick_mode(mode) {
        this.kick_mode = mode;
    };
};
