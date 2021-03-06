var https = require('https')
    , xml2js = require('xml2js')
    , js2xml = require('data2xml');

var convertToXml = js2xml({ xmlDecl: false , attrProp: '$', valProp: '_' });

function merge(a, b) {
    for (var p in b) {
        try {
            if (b[p].constructor === Object) {
                a[p] = merge(a[p], b[p]);
            } else {
                a[p] = b[p];
            }
        } catch (e) {
            a[p] = b[p];
        }
    }
    return a;
}

function httpsRequest(options, callback) {
    options.method = options.method || 'POST';
    options.headers = options.headers || {};

    if (options.data) {
        options.headers['Content-Length'] = options.data.length;
    }

    var req = https.request(options);

    req.on('response', function (res) {
        var response = '';
        res.setEncoding('utf8');

        res.on('data', function (chunk) {
            response += chunk;
        });

        res.on('end', function () {
            return callback(null, {
                statusCode: res.statusCode,
                body:       response
            });
        });
    });

    req.on('error', function (e) {
        callback(e);
    });

    if (options.data) {
        req.write(options.data);
    }

    req.end();
}

var Moip = function (config) {
    var defaultConfig = {
        token:      '01010101010101010101010101010101',
        key:        'ABABABABABABABABABABABABABABABABABABABAB',
        sandbox:    false,
        sandboxHostname:        'desenvolvedor.moip.com.br',
        productionHostName:     'moip.com.br',
        sandboxCheckoutUrl:     'https://desenvolvedor.moip.com.br/sandbox/Instrucao.do?token=',
        productionCheckoutUrl:  'https://moip.com.br/Instrucao.do?token='
    };

    this.config = merge(defaultConfig, config);

    this.config.auth = new Buffer(this.config.token + ':' + this.config.key).toString('base64');
};

Moip.prototype.callApi = function (requestMethod, apiMethod, data, callback) {
    var config = this.config;

    var options = {
        method:     requestMethod,
        hostname:   config.sandbox ? config.sandboxHostname : config.productionHostName,
        path:       (config.sandbox ? '/sandbox/ws/alpha/' : '/ws/alpha/') + apiMethod,
        data:       data,
        headers: {
            'Authorization':    'Basic ' + config.auth,
            'Content-Type':     'application/x-www-form-urlencoded',
            'Content-Charset':  'text/xml;charset=UTF-8' 
        }
    };

    httpsRequest(options, function (error, response) {
        if (error) { return callback(error); }

        var body = response.body;
        var statusCode = response.statusCode;

        if (statusCode < 200 || statusCode >= 300) {
            error = new Error('Response Status: ' + statusCode);
            error.response = body;
            error.httpStatusCode = statusCode;
            return callback(error);
        }

        return callback(null, body);
    });
};

Moip.prototype.getToApi = function (url, callback) {
    this.callApi('GET', url, null, callback);
};

Moip.prototype.postToApi = function (url, data, callback) {
    this.callApi('POST', url, data, callback);
};

Moip.prototype.createPayment = function (data, callback) {
    var that = this;

    if (!data['EnviarInstrucao']) {
        return callback(new Error('Invalid json, root must be "EnviarInstrucao"'));
    }

    var xml = convertToXml('EnviarInstrucao', data['EnviarInstrucao']);

    this.postToApi('EnviarInstrucao/Unica', xml, function (err, xmlResponse) {
        if (err) { return callback(err); }

        xml2js.parseString(xmlResponse, function (err, json) {
            if (err) { return callback(err, xmlResponse); }

            var response = json[Object.keys(json)[0]]['Resposta'][0];

            if (/falha/i.test(response['Status'][0])) {
                var error = new Error(response['Erro'][0]['_']);
                error.code = response['Erro'][0]['$']['Codigo'];
                return callback(error, json);
            }

            callback(err, {
                token:          response['Token'][0],
                checkoutUrl:    that.getCheckoutUrl(response['Token'][0]),
                xmlResponse:    xmlResponse
            });
        });
    });
};

Moip.prototype.getPaymentInfo = function (token, callback) {
    this.getToApi('ConsultarInstrucao/' + token, function (err, xmlResponse) {
        if (err) { return callback(err); }

        callback(null, xmlResponse);
    });
};

Moip.prototype.getCheckoutUrl = function (token) {
    return (this.config.sandbox ? this.config.sandboxCheckoutUrl : this.config.productionCheckoutUrl) + token;
};

Moip.prototype.enviarInstrucaoUnica = Moip.prototype.createPayment;
Moip.prototype.consultarInstrucao = Moip.prototype.getPaymentInfo;

module.exports = Moip;