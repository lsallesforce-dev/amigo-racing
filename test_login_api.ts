import axios from 'axios';

async function testLogin() {
    const url = 'http://localhost:3000/api/auth/login';
    const payload = {
        email: 'projeto@lstecnologias.com.br',
        password: 'admin'
    };

    console.log(`Sending POST to ${url}...`);
    try {
        const response = await axios.post(url, payload);
        console.log('Status:', response.status);
        console.log('Data:', response.data);
    } catch (error: any) {
        if (error.response) {
            console.log('Error Status:', error.response.status);
            console.log('Error Data:', error.response.data);
        } else {
            console.log('Error Message:', error.message);
        }
    }
}

testLogin();
