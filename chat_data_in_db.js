/*
    Прикручиваем PostgreSQL базенку через node-postgres библу:
    https://node-postgres.com/
    данные о подключении тащим в переменных окружения контейнера:
*/
module.exports = class Chat_data_in_db {
    static async init(chat_ctx, pool) {
        const query = {
            text: 'SELECT   chats.id as id, chats.tg_chat_id, chats.name, chats.wait_for_name, chats.edit_mode, chats.delimiter, chats.kick_mode, chats.last_list_message_id, chats.wait_for_value_index, stuff.id as stuff_id, stuff.value as value, chs.stuff_order as stuff_order    FROM chats  LEFT JOIN chat_has_stuff as chs ON chats.tg_chat_id = chs.tg_chat_id    LEFT JOIN stuff ON chs.stuff_id = stuff.id  WHERE chats.tg_chat_id=$1   ORDER BY stuff_order',
            values: [chat_ctx.id],
            //rowMode: 'array' //- по умолчанию
         }
        const res = await pool.query(query)
            .catch(err=>console.error('ошибка запроса в БД:\n',err));

        if (res?.rowCount > 0) {
            //создаем экземпляр по данным из базы
            console.log('создаем экземпляр по данным из базы');
            return new Chat_data_in_db(res, pool);
        } else {    
            console.warn('Чат (',JSON.stringify(chat_ctx,null,1),') не найден в базе данных, создаем запись-пустышку...\nres=',JSON.stringify(res,null,1));
            //@TODO! проверить
            const get_name = function() {
                if (chat_ctx.type == 'group') {
                    return chat_ctx.title;
                } else {return 'Список'}
             }
            const record = {
                text: 'INSERT INTO CHATS(tg_chat_id, name) VALUES($1, $2) RETURNING *',
                values: [chat_ctx.id, get_name()]
             } 
            const new_record = await pool.query(record)
                .then(console.log(`новый чат (${chat_ctx.id}) занесен в бд.`))
                .catch(err=>console.error('ошибка записи в БД:\n',err));
            return new Chat_data_in_db(new_record, pool);
         }
     }

    constructor(data, pool) { 
        const chat = data.rows[0];
        this.id = chat.id;
        this.tg_chat_id = chat.tg_chat_id;
        this.list_name = {name: chat.name, wait_for_name: chat.wait_for_name }
        this.edit_mode = chat.edit_mode;
        this.delimiter = chat.delimiter;
        this.kick_mode = chat.kick_mode;
        this.last_list_message_id = chat.last_list_message_id;
        this.wait_for_value_index = chat.wait_for_value_index;
        this.list = data.rows.map((field)=>({value: field.value, order: field.stuff_order, stuff_id: field.stuff_id})).filter(element=>element.value != null); //сортировка элементов достигается сортировкой выборки SQL: SORT BY field.stuff_order
        //console.warn('!!! работаем с БД!!!');
        console.log(this);
        //console.dir(data);
        this.db = pool;
     }

    get is_empty() {
        return this.list.length == 0;
     }

    async #insert_value(v, order){
        if (v?.trim() != '') {
            const element = v.toLowerCase().trim();
            if (this.list.indexOf(element) === -1) {                
                const stuff_value_query = {
                    text: 'WITH ins_result AS (INSERT INTO STUFF (value) VALUES ($1) ON CONFLICT (value) DO UPDATE SET value = excluded.value RETURNING id) SELECT id FROM ins_result',
                    values: [element]
                 } 
                const stuff_value_res = await this.db.query(stuff_value_query)
                    .then(this.list.push({value: element, order: order}))
                    .catch(err=>console.error('ошибка записи в БД:\n',err));
                const insert_new_ref_to_chs_query = {
                    text: 'INSERT INTO CHAT_HAS_STUFF (tg_chat_id, stuff_id, stuff_order) VALUES ($1, $2, $3)',
                    values: [this.tg_chat_id, stuff_value_res.rows[0].id, order]
                 }
                await this.db.query(insert_new_ref_to_chs_query);                
                return element;
            } else {
                return undefined;
             }
         }
     }

    async insert(value) {
        //@TODO: добавить информацию о том, кто внес данные - для групповых чатов
        let last = undefined;
        try {
            //определим макс порядковое значение в чате
            const res = await this.db.query(`SELECT MAX(stuff_order) FROM chat_has_stuff WHERE tg_chat_id=${this.tg_chat_id}`)
                .catch(err=>console.error('ошибка запроса в БД:\n',err));
            let current_order = Number(res.rows[0].max) + 1;//находим максимальный и сразу  увеличиваем на 1
            //если передано множество значений, обработаем их параллельно и выловим последнее last, иначе все проще insert и есть last 
            if (this.delimiter) {
                last = await Promise.all(value.split(this.delimiter).map(async (v,i) => this.#insert_value(v, current_order+i)));
                last = last.find(v => v != undefined);
            } else {
                last = await this.#insert_value(value, current_order);
             } 
            await this.db.query('COMMIT');
        } catch (err) {
            await this.db.query('ROLLBACK');
            console.error('ошибка записи в БД, выполнен ROLLBACK:\n',err);
        }
        return last;
     }

    async kick(index) {
        const record = {
            text: 'DELETE FROM CHAT_HAS_STUFF WHERE tg_chat_id = $1 AND stuff_id in (SELECT id FROM STUFF WHERE value = $2)',
            values: [this.tg_chat_id, this.list[index].value]
         } 
        await this.db.query(record)
            .then(this.list.splice(index, 1))
            .catch(err=>console.error('ошибка записи в БД:\n',err));
     }

    async clear_list() {
        const record = {
            text: 'DELETE FROM CHAT_HAS_STUFF WHERE tg_chat_id = $1',
            values: [this.tg_chat_id]
         } 
        await this.db.query(record)
            .then(this.list = [])
            .catch(err=>console.error('ошибка записи в БД:\n',err));
     }

    async set_last_list_message_id(message_id) {
        if (message_id && this.last_list_message_id != message_id) {
            const record = {
                text: 'UPDATE CHATS SET last_list_message_id = $1 WHERE CHATS.tg_chat_id = $2',
                values: [message_id, this.tg_chat_id]
             } 
            await this.db.query(record)
                .then(this.last_list_message_id = message_id)
                .catch(err=>console.error('ошибка записи в БД:\n',err));
        }
     }

    async wait_for_name(flag = false) {
        if(this.list_name.wait_for_name != flag) {
            const record = {
                text: 'UPDATE CHATS SET wait_for_name = $1 WHERE CHATS.tg_chat_id = $2',
                values: [flag, this.tg_chat_id]
             } 
            await this.db.query(record)
                .then(this.list_name.wait_for_name = flag)
                .catch(err=>console.error('ошибка записи в БД:\n',err));
        }
     }

    async wait_for_value_at(index) {
        if(this.wait_for_value_index != index) {
            const record = {
                text: 'UPDATE chats SET wait_for_value_index = $1 WHERE CHATS.tg_chat_id = $2',
                values: [index, this.tg_chat_id]
             } 
            await this.db.query(record)
                .then(this.wait_for_value_index = index)
                .catch(err=>console.error('ошибка записи в БД:\n',err));
        }
     }

    async update_value_at_wait_for_value_index(value) { 
        if ((this.wait_for_value_index >= 0) && (value?.trim() != '')) {
            const element = value.toLowerCase().trim();
            //если значение уже в списке, то ничего выполнять не надо
            if (this.list.indexOf(element) === -1) {
                try {
                    await this.db.query('BEGIN');
                    const stuff_value_query = {
                        text: 'WITH ins_result AS (INSERT INTO STUFF (value) VALUES ($1) ON CONFLICT (value) DO UPDATE SET value = excluded.value RETURNING id) SELECT id FROM ins_result',
                        values: [element]
                     } 
                    const stuff_value_res = await this.db.query(stuff_value_query);
                    const delete_old_ref_from_chs_query = {
                        text: 'DELETE FROM CHAT_HAS_STUFF WHERE tg_chat_id=$1 AND stuff_id IN (SELECT ID FROM STUFF WHERE VALUE=$2)',
                        values: [this.tg_chat_id, this.list[this.wait_for_value_index].value]
                     }
                    await this.db.query(delete_old_ref_from_chs_query);
                    const insert_new_ref_to_chs_query = {
                        text: 'INSERT INTO CHAT_HAS_STUFF (tg_chat_id, stuff_id, stuff_order) VALUES ($1, $2, $3)',
                        values: [this.tg_chat_id, stuff_value_res.rows[0].id, this.list[this.wait_for_value_index].order]
                     }
                    await this.db.query(insert_new_ref_to_chs_query);
                    await this.db.query('COMMIT');
                    this.list[this.wait_for_value_index].value = element;
                    return element;
                  } catch (err) {
                    await this.db.query('ROLLBACK');
                    console.error('ошибка записи в БД, выполнен ROLLBACK:\n',err);
                  }
            } else { return undefined  }
         }
     }

    async set_list_name(name) {
        if (name) {
            const correct_name=name.slice(0,25);
            const record = {
                text: 'UPDATE CHATS SET name = $1 WHERE CHATS.tg_chat_id = $2',
                values: [correct_name, this.tg_chat_id]
             } 
            await this.db.query(record)
                .then(this.list_name.name = correct_name)
                .catch(err=>console.error('ошибка записи в БД:\n',err));
         }
     }
    
    async set_delimiter(delimiter) {
        if(this.delimiter != delimiter) {
            const record = {
                text: 'UPDATE CHATS SET delimiter = $1 WHERE CHATS.tg_chat_id = $2',
                values: [delimiter, this.tg_chat_id]
             } 
            await this.db.query(record)
                .then(this.delimiter = delimiter)
                .catch(err=>console.error('ошибка записи в БД:\n',err));
        }
     }

    async set_kick_mode(mode) {
        if(this.kick_mode != mode){
            const record = {
                text: 'UPDATE CHATS SET kick_mode = $1 WHERE CHATS.tg_chat_id = $2',
                values: [mode, this.tg_chat_id]
             } 
            await this.db.query(record)
                .then(this.kick_mode = mode)
                .catch(err=>console.error('ошибка записи в БД:\n',err));
        }
     }

    async toggle_edit_mode() {
        const record = {
            text: 'UPDATE CHATS SET edit_mode = $1 WHERE CHATS.tg_chat_id = $2',
            values: [!this.edit_mode, this.tg_chat_id]
         } 
        await this.db.query(record)
            .then(this.edit_mode = !this.edit_mode)
            .catch(err=>console.error('ошибка записи в БД:\n',err));
     }

    //Перемещение элементов вверх. Толкаем элемент вверх, но если толкаем первый элемент, то он проваливается в хвост, а вся гусеница ползет вверх
    async move_up(index) {
        //получить идентификатор и ключ сортировки выделенного элемента
        const current_element_order_key = this.list[index].order;
        const current_element_stuff_id = this.list[index].stuff_id;
        try {
            await this.db.query('BEGIN');
            if (index > 0) {
                //пишем в базу новый индекс текущего элемента
                await this.db.query(`UPDATE chat_has_stuff chs SET stuff_order=${this.list[index-1].order} where tg_chat_id=${this.tg_chat_id} and stuff_id=${current_element_stuff_id}`);
                //пишем в базу новый индекс подвинутого элемента
                await this.db.query(`UPDATE chat_has_stuff chs SET stuff_order=${current_element_order_key} where tg_chat_id=${this.tg_chat_id} and stuff_id=${this.list[index-1].stuff_id}`);
                //меняем местами элементы списка
                [this.list[index - 1], this.list[index]] = [this.list[index], this.list[index - 1]];
            } else {
                //сгенерировать новый "последний" (самый большой в этом чате) ключ сортировки смещаемого элемента
                const new_element_order_key = this.list[this.list.length-1].order + 1;
                //пишем в базу новый индекс текущего элемента
                await this.db.query(`UPDATE chat_has_stuff chs SET stuff_order=${new_element_order_key} where tg_chat_id=${this.tg_chat_id} and stuff_id=${current_element_stuff_id}`);
                //вырываем первый элемент из списка и вставляем его в хвост
                this.list.push(this.list.shift());
             }
            await this.db.query('COMMIT');
        } catch (err) {
            await this.db.query('ROLLBACK');
            console.error('Ошибка при попытке перемещения элемента наверх, выполнен ROLLBACK:\n',err);
        }
    }
}
