var running = false;
var display;
var contr;
var sender;
var receiver;
var endToEndDelay = 1000;
var paper;

//////////////////////////////////////////////////////////////////////////////
// Class Timer
//////////////////////////////////////////////////////////////////////////////
function Timer(cb, delay) {
    this.cb = cb;
    this.delay = delay;
    this.timerId = null;
}
// Static
Timer.runningTimers = new Object();

Timer.prototype.stop = function() {
    if (this.timerId !== null) {
        window.clearTimeout(this.timerId);
        delete Timer.runningTimers[this.timerId];
    }
}

Timer.prototype.start = function() {
    this.timerId = window.setTimeout(this.cb, this.delay);
    Timer.runningTimers[this.timerId] = this;
}

//////////////////////////////////////////////////////////////////////////////
function disableFormItems(disable, group) {
    if (disable === true) {
        var e = $('.form-group').addClass('disabled');
        e.find('input, select').filter(':not([disabled])').attr('disabled', 'disabled').addClass('temp-disabled');
        e.find('div.ui-slider').slider("option", "disabled", true);
    } else {
        var e = $('.form-group').removeClass('disabled', 300, 'linear');
        e.find('input, select').filter('.temp-disabled').removeAttr('disabled');
        e.find('div.ui-slider').slider("option", "disabled", false);
    }
}

//////////////////////////////////////////////////////////////////////////////
// Class Controller
//////////////////////////////////////////////////////////////////////////////
function Controller() {
    this.running = false;
    this.interval;
    this.timeBetweenPkts = 1000;
}

Controller.prototype.getMethod = function() {
    return $('input[name=method]:checked').val();
}

Controller.prototype.setMethod = function() {
    initAnimation(this.getMethod());
}

Controller.prototype.getSenderN = function() {
    return parseInt(document.getElementById('senderN').value);
}

Controller.prototype.setSenderN = function() {
    var n = this.getSenderN();
    display.setN(n, sender.base);
    sender.N = n;
    if (typeof receiver.N != 'undefined') {
        receiver.N = n;
    }
}

Controller.prototype.getEndToEndDelay = function() {
    return parseInt(document.getElementById('endToEndDelay').value);
}

Controller.prototype.setEndToEndDelay = function() {
    endToEndDelay = this.getEndToEndDelay();
}

Controller.prototype.getTimeout = function() {
    return parseInt(document.getElementById('timeout').value);
}

Controller.prototype.setTimeout = function() {
    sender.timeout = this.getTimeout();
}

Controller.prototype.getPktPerMin = function() {
    return parseInt(document.getElementById('pktPerMin').value);
}

Controller.prototype.setPktPerMin = function() {
    this.timeBetweenPkts = 1 / (this.getPktPerMin() / 60) * 1000;
}

Controller.prototype.emit = function() {
    sender.send(1);
}

Controller.prototype.startStop = function() {
    if (this.running) {
        window.clearInterval(this.interval);
        window.location = ''; // hacky way to reset everything immediately
    } else {
        sender.send(1);
        window.clearInterval(this.interval);
        this.interval = window.setInterval('sender.send(1)', this.timeBetweenPkts);

        disableFormItems(true);
    }
    this.running = !this.running;

    document.getElementById('start').value = (this.running ? 'stop' : 'start');
}

Controller.prototype.allPacketsReceived = function() {
    if (this.running)
        return;

    disableFormItems(false);
}

//////////////////////////////////////////////////////////////////////////////
// class Packet
//////////////////////////////////////////////////////////////////////////////
function Packet(sequenceNumber, data) {
    this.sequenceNumber = sequenceNumber;
    this.data = data;
    this.timer = null;
}

Packet.prototype.send = function(dst, timeout) {
    this.timer = new Timer(function() {
        dst.receive(this);
    }.bind(this), timeout);

    this.timer.start();
}

Packet.prototype.stop = function() {
    this.timer.stop();
}

//////////////////////////////////////////////////////////////////////////////
// Class SenderGoBackN
//////////////////////////////////////////////////////////////////////////////
function SenderGoBackN(N) {
    this.partner;

    this.base = 1;
    this.nextsequenceNumber = 1;
    this.N = N;
    this.pkt = new Array();

    this.timeout = 2000;
    this.timer = null;
}

SenderGoBackN.prototype.timeoutHandler = function() {
    this.timer = new Timer(function() {
        this.timeoutHandler();
    }.bind(this), this.timeout);
    display.startWindowTimer(this.timeout);

    for (var i = this.base; i < this.nextsequenceNumber; i++) {
        this.pkt[i].send(this.partner, endToEndDelay);

        display.send(true, this.pkt[i]);
    }
}

SenderGoBackN.prototype.send = function(data) {
    if (this.nextsequenceNumber < this.base + this.N) {
        this.pkt[this.nextsequenceNumber] = new Packet(this.nextsequenceNumber, data);

        this.pkt[this.nextsequenceNumber].send(this.partner, endToEndDelay);

        display.send(true, this.pkt[this.nextsequenceNumber]);

        if (this.base == this.nextsequenceNumber) {
            console.log("first packet in frame: start timer");
            this.restartTimer();
        }
        this.nextsequenceNumber++;

        return true;
    } else {
        return false;
    }
}

SenderGoBackN.prototype.receive = function(ack) {
    if (ack.sequenceNumber < this.base) {
        return;
    }
    for (var i = this.base; i < ack.sequenceNumber + 1; i++)
        display.confirmSender(i);

    display.setSenderBase(ack.sequenceNumber + 1 - this.base, ack.sequenceNumber + 1);

    this.base = ack.sequenceNumber + 1;

    if (this.base == this.nextsequenceNumber) {
        this.timer.stop();
        display.stopWindowTimer();
    } else {
        this.restartTimer();
    }
}

SenderGoBackN.prototype.restartTimer = function() {
    if (this.timer) {
        this.timer.stop();
    }

    this.timer = new Timer(function() {
            this.timeoutHandler();
        }.bind(this),
        this.timeout);
    this.timer.start();
    display.restartWindowTimer(this.timeout);
}

//////////////////////////////////////////////////////////////////////////////
// Class ReceiverGoBackN
//////////////////////////////////////////////////////////////////////////////
function ReceiverGoBackN() {
    this.partner;

    this.expectedsequenceNumber = 1;
    this.sendPacket = new Packet(0, 'ACK');
}

ReceiverGoBackN.prototype.receive = function(packet) {
    if (packet.sequenceNumber == this.expectedsequenceNumber) {
        this.sendPacket = new Packet(this.expectedsequenceNumber, 'ACK');
        display.confirmReceiver(this.sendPacket.sequenceNumber);
        display.deliverPkt(this.sendPacket.sequenceNumber);

        this.expectedsequenceNumber++;
    }
    this.sendPacket.send(this.partner, endToEndDelay);
    display.send(false, this.sendPacket);
}

//////////////////////////////////////////////////////////////////////////////
function init() {
    contr = new Controller();
    initAnimation(contr.getMethod());
}

//////////////////////////////////////////////////////////////////////////////
function initAnimation(method) {
    display = null;
    sender = null;
    receiver = null;
    Object.keys(Timer.runningTimers).forEach(function(tId) {
        Timer.runningTimers[tId].stop();
    });

    var n = contr.getSenderN();

    display = new Display(n, false);
    sender = new SenderGoBackN(n);
    receiver = new ReceiverGoBackN();

    sender.partner = receiver;
    receiver.partner = sender;

    contr.setEndToEndDelay();
    contr.setTimeout();
}

//////////////////////////////////////////////////////////////////////////////
// Class Display
//////////////////////////////////////////////////////////////////////////////
function Display(windowN, hasWindowReceiver) {
    this.paper = $('#root');
    this.paper.children(':not(div.desc)').remove();
    this.paper.css({
        'left': '0px'
    });

    this.windowN = windowN;
    this.hasWindowReceiver = hasWindowReceiver
    this.windowOffset = 5;
    this.sequenceNumberToPkt = new Object();
    this.windowSender;
    this.windowReceiver;
    this.xOffset = 0;
    this.xOffsetLast = 0;
    this.nextFreeSeqNum = 1 - this.windowOffset;
    this.nextFreePktIndex = 0;
    this.nextSeqNumToRemove = 0;
    this.windowTimer;
    this.packetsAlive = 0;
    this.pktTimers = new Object();
    this.windowTimerStarted = false;
    this.windowTimerCenter = 390;


    for (var i = 0; i < 30; i++) {
        this.createPackets();
    }
    this.setN(this.windowN, 1);
}

Display.prototype.reducePacketsAlive = function(sequenceNumber) {
    this.packetsAlive--;
    this.alive();
}

Display.prototype.alive = function() {
    if (this.packetsAlive == 0 && Object.keys(this.pktTimers).length == 0 && this.windowTimerStarted == false) {
        contr.allPacketsReceived();
    }
}

Display.prototype.setN = function(windowN, base) {
    this.windowN = windowN;
    if (typeof this.windowSender === 'undefined') {
        var marginLeft = 100;
        var x = 10 + 27 * (base + this.windowOffset - 1) - 2;
        var y = 8
        var width = 4 + this.windowN * 16 + (this.windowN - 1) * 11;
        var height = 34;

        this.windowSender = $('<div>&nbsp;</div>').css({
            left: x + 'px',
            top: y + 'px',
            width: width + 'px',
            height: height + 'px'
        }).attr('class', 'window').appendTo(this.paper);

        if (!this.hasWindowReceiver) {
            this.windowTimer = $('<canvas height="40" width="40">&nbsp;</canvas>').css({
                left: this.windowTimerCenter + 'px',
                top: '165px',
            }).attr('class', 'window-timer').appendTo(this.paper);
        }

        if (this.hasWindowReceiver) {
            this.windowReceiver = $('<div>&nbsp;</div>').css({
                left: 10 + 27 * (base + this.windowOffset - 1) - 2 + 'px',
                top: 358 + 'px',
                width: width + 'px',
                height: height + 'px'
            }).attr('class', 'window').appendTo(this.paper);
        }
    } else {
        var width = 4 + this.windowN * 16 + (this.windowN - 1) * 11;
        this.windowSender.css('width', width + 'px');

        if (this.hasWindowReceiver) {
            this.windowReceiver.css('width', width + 'px');
        }
    }
}

Display.prototype.createPackets = function() {
    var width = 16,
        height = 30,
        size = 25;
    var s = $('<div><canvas width="' + size + '" height="' + size + '"></canvas></div>').css({
        left: 10 + this.nextFreePktIndex * 27 + 'px',
        top: 10 + 'px'
    }).attr('class', 'pkt').data('index', this.nextFreePktIndex).appendTo(this.paper);

    var r = $('<div>&nbsp;</div>').css({
        left: 10 + this.nextFreePktIndex * 27 + 'px',
        top: 330 + 'px'
    }).attr('class', 'pkt empty').data('index', this.nextFreePktIndex).appendTo(this.paper);

    this.sequenceNumberToPkt[this.nextFreeSeqNum] = {
        'sender': s,
        'receiver': r
    };

    this.nextFreeSeqNum++;
    this.nextFreePktIndex++;
}

Display.prototype.confirmSender = function(sequenceNumber) {
    $(this.sequenceNumberToPkt[sequenceNumber].sender).attr('class', 'pkt confirmed');
}

Display.prototype.confirmReceiver = function(sequenceNumber) {
    $(this.sequenceNumberToPkt[sequenceNumber].receiver).attr('class', 'pkt');
}

Display.prototype.deliverPkt = function(sequenceNumber) {
    $(this.sequenceNumberToPkt[sequenceNumber].receiver).attr('class', 'pkt delivered');
}

Display.prototype.setSenderBase = function(count, newBase) {
    if (count == 0) {
        return;
    }

    this.xOffset += count * 27;

    for (var i = 0; i < count; i++) {
        this.createPackets();
    }

    var newX = 10 + this.sequenceNumberToPkt[newBase].sender.data('index') * 27 - 2;
    this.windowSender.animate({
        'left': newX + 'px'
    }, 100);


    if (this.windowTimer != null) {
        this.windowTimerCenter += count * 27;
        this.windowTimer.stop().animate({
            'left': this.windowTimerCenter + 'px',
        }, 100);
    }

    if (newX + this.windowSender.width() - this.xOffsetLast >= 250) {
        this.paper.stop().animate({
            left: -this.xOffset + "px"
        }, 400, function() {
            for (var i = this.nextSeqNumToRemove; i < this.nextFreeSeqNum; i++) {
                if ($(this.sequenceNumberToPkt[i].sender).offset().left > -27)
                    break;

                $(this.sequenceNumberToPkt[i].sender).add(this.sequenceNumberToPkt[i].receiver).remove();
                delete this.sequenceNumberToPkt[i];

                this.nextSeqNumToRemove++;
            }
        }.bind(this));

        this.xOffsetLast = this.xOffset;
    }
}


Display.prototype.setReceiverBase = function(count, newBase) {
    if (count == 0 || !hasWindowReceiver) {
        return;
    }

    var newX = 10 + this.sequenceNumberToPkt[newBase].sender.data('index') * 27 - 2;
    this.windowReceiver.stop().animate({
        left: newX + 'px'
    }, 200);
}

Display.prototype.send = function(toReceiver, pkt) {
    var sequenceNumber = pkt.sequenceNumber;
    var time = endToEndDelay;
    var square;
    var org, fromY, tClass;

    if (toReceiver) {
        org = this.sequenceNumberToPkt[sequenceNumber].sender;
        fromY = 10;
        tClass = 'pkt';
    } else {
        org = this.sequenceNumberToPkt[sequenceNumber].receiver;
        fromY = 330;
        tClass = 'pkt ack';
    }

    square = $(org).clone().attr('class', tClass).appendTo(this.paper).css('top', fromY + 'px');
    this.packetsAlive++;

    var self = this;

    square.animate({
        top: ((toReceiver) ? 330 : 10) + 'px'
    }, time, 'linear', function() {
        $(square).remove();
        self.reducePacketsAlive(sequenceNumber);
    });

    square.mousedown(function(e) {
        pkt.stop();
        self.reducePacketsAlive(sequenceNumber);

        square.stop().css({
            background: '#ff0000'
        }).delay(100).remove();
    });
}

Display.prototype.startPacketTimer = function(sequenceNumber, time) {
    if (typeof this.sequenceNumberToPkt[sequenceNumber] === 'undefined')
        return;

    var $c = $(this.sequenceNumberToPkt[sequenceNumber].sender).children('canvas');
    if (typeof $c.data('timer') === 'undefined') {
        $c.data('timer', new TimerCircle(25, $c, 'pkt'));
    }

    $c.data('timer').start(time);
}

Display.prototype.stopPktTimer = function(sequenceNumber) {
    if (typeof this.sequenceNumberToPkt[sequenceNumber] === 'undefined')
        return;

    var t = $(this.sequenceNumberToPkt[sequenceNumber].sender).children('canvas').data('timer');
    if (typeof t != 'undefined')
        t.stop();

    this.alive();
}

Display.prototype.startWindowTimer = function(time) {
    this.windowTimer.data('timer', new TimerCircle(40, this.windowTimer, 'window'));
    this.windowTimer.data('timer').start(time);
    this.windowTimerStarted = true;
}

Display.prototype.restartWindowTimer = function(time) {
    if (this.windowTimer.data('timer'))
        this.windowTimer.data('timer').stop();

    this.startWindowTimer(time);
}

Display.prototype.stopWindowTimer = function() {
    this.windowTimer.data('timer').stop();
    this.windowTimerStarted = false;

    this.alive();
}


//////////////////////////////////////////////////////////////////////////////
// Class TimerCircle
//////////////////////////////////////////////////////////////////////////////
function TimerCircle(size, canvas, type) {
    this.size = size;
    this.type = type;
    this.timer = $({
        percent: 100
    }),
    lastValue = 200;

    this.context = canvas[0].getContext('2d');

    if (type != 'window' && type != 'pkt') {
        throw "type " + type + ' is not defined';
    }
    return this;
}

TimerCircle.prototype.timeoutCircle = function(c, x, y, width, value, total) {
    if (value <= 0) {
        return;
    }

    c.save();
    var r = width / 2,
    cx = x + r,
    cy = y + r;
    c.fillStyle = '#ff00ff';

    c.beginPath();
    c.arc(cx, cy, r, Math.PI * 3 / 2, 2 * Math.PI * value / total + Math.PI * 3 / 2, false);
    c.lineTo(cx, cy);
    c.closePath();
    c.fill();

    c.restore();
}

TimerCircle.prototype.stop = function() {
    this.timer.stop(true, true);
    return this;
}

TimerCircle.prototype.start = function(time) {
    this.timer.stop(false, true);
    this.timer[0].percent = 100;
    this.timer.animate({
        percent: 0
    }, {
        step: function(now, fx) {
            now = Math.ceil(now);
            if (now == lastValue) {
                return;
            }

            this.context.clearRect(0, 0, this.size, this.size);
            this.timeoutCircle(this.context, 0, 0, this.size, now, 100);
            lastValue = now;
        }.bind(this),
        duration: time
    });
    return this;
}

