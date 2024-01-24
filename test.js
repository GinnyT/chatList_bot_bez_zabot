const DATA = require('./chat_data_in_files');

//Тесты

const true_data = new DATA(314396134);
//DATA.known_list(true_data.id, (list)=>{return true_data.list = list});
//true_data.list = 'FUCK!';
const false_data = new DATA(123);
/* DATA.INIT(true_data.id)
.then(list=>console.log('list by INIT= ', list)); */


console.log('false= ', false_data);
console.log('true',true_data);