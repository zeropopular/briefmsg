
var sipClient = function (){

    var oSipStack, oSipSessionRegister, oSipSessionCall, oSipSessionTransferCall;
	var messageSessions;
	var client = this;
	var disconnectByUser;
	var connected = false;

    this.register = function(username, realm, password, proxy){

		var proxyAddr;
		var proxyPort;

		if(typeof proxy === 'undefined' || proxy.length == 0) {
			proxyAddr = realm;
			proxyPort = 5060;
		}
		else {
			var colon = proxy.indexOf(':', 5);
			
			if(colon < 0) {
				proxyAddr = proxy;
				proxyPort = 5060;
			}
			else {
				proxyAddr = proxy.substring(0, colon);
				proxyPort = parseInt(proxy.substring(colon + 1));
			}
		}

		disconnectByUser = false;
		
		try{
			oSipStack = new tsip_stack(realm, username, 'sip:' + username + '@' + realm, proxyAddr, proxyPort,
								tsip_stack.prototype.SetPassword(password),
								tsip_stack.prototype.SetHeader('User-Agent', 'OfficeSIP Toast'),
								tsip_stack.prototype.SetHeader('Organization', 'OfficeSIP'));

			oSipStack.on_event_stack = onSipEventStack;
			oSipStack.on_event_dialog = onSipEventDialog;
			//oSipStack.on_event_invite = onSipEventInvite;
			oSipStack.on_event_message = onSipEventMessage;

			return oSipStack.start();
		}
		catch(err){
			client.trigger({type: 'connecterror', reason: err});
			return false;
		}
    }

    this.unRegister = function(){
		disconnectByUser = true;
		if (oSipStack)
            oSipStack.stop();
    }
	
	this.send = function(contacts, text){
	
		if(connected == false){
			for(var i=0; i<contacts.length; i++){
				this.trigger({type: 'beforesendone', id: i, contact: contacts[i], uri: contacts[i].uri });
				this.trigger({type: 'sentone', id: i, uri: contacts[i].uri, success: false, phrase: 'Not Connected' });
			}
		}
		else{
			messageSessions = new Array();
			
			for(var i=0; i<contacts.length; i++){
				var session = new tsip_session_message(oSipStack, tsip_session.prototype.SetToStr(contacts[i].uri));
			
				this.trigger({
					type: 'beforesendone',
					id: session.get_id(),
					contact: contacts[i],
					uri: session.o_uri_to.toString()
				});

				messageSessions.push(session);
			}

			for(var i=0; i<messageSessions.length; i++){
				messageSessions[i].send(new String(text), 'text/plain; charset=utf8');
			}
		}
	}

    var onSipEventStack = function(evt){
        // this is a special event shared by all sessions and there is no "e_stack_type"
        // check the 'sip/stack' code
        console.debug(evt.s_phrase);
        switch (evt.i_code) {
            case tsip_event_code_e.STACK_STARTED:
                {
					try{
                    // LogIn (REGISTER) as soon as the stack finish starting
                    oSipSessionRegister = new tsip_session_register(oSipStack,
                                            tsip_session.prototype.SetExpires(200));//,
                                            //tsip_session.prototype.SetCaps("+g.oma.sip-im"),
                                            //tsip_session.prototype.SetCaps("+audio"),
                                            //tsip_session.prototype.SetCaps("language", "\"en,fr\""));
                    oSipSessionRegister.register();
                    break;
					}
					catch(err){
						alert(err);
					}
                }
            case tsip_event_code_e.STACK_STOPPING:
            case tsip_event_code_e.STACK_STOPPED:
                {
                    oSipStack = null;
                    oSipSessionRegister = null;
                    oSipSessionCall = null;
                    break;
                }

            case tsip_event_code_e.STACK_STARTING:
            case tsip_event_code_e.STACK_FAILED_TO_START:
            case tsip_event_code_e.STACK_FAILED_TO_STOP:
            default:
                {
                    break;
                }
        }
    };
	
    var onSipEventDialog = function(evt){
        console.debug(evt.s_phrase);
        switch (evt.i_code) {
            case tsip_event_code_e.DIALOG_TRANSPORT_ERROR:
            case tsip_event_code_e.DIALOG_GLOBAL_ERROR:
            case tsip_event_code_e.DIALOG_MESSAGE_ERROR:
            case tsip_event_code_e.DIALOG_WEBRTC_ERROR:
				{
					if(isRegisterEvent(evt)){
						connected = false;
						client.trigger({type: 'connecterror', reason: evt.s_phrase});
					}
					break;
				}

            case tsip_event_code_e.DIALOG_REQUEST_INCOMING:
            case tsip_event_code_e.DIALOG_REQUEST_OUTGOING:
            case tsip_event_code_e.DIALOG_REQUEST_CANCELLED:
            case tsip_event_code_e.DIALOG_REQUEST_SENT:
            case tsip_event_code_e.DIALOG_MEDIA_ADDED:
            case tsip_event_code_e.DIALOG_MEDIA_REMOVED:

            default: break;


            case tsip_event_code_e.DIALOG_CONNECTING:
				{
					if(isRegisterEvent(evt))
						client.trigger({type: 'connecting'});
					break;
				}
					
            case tsip_event_code_e.DIALOG_CONNECTED:
				{
					if(isRegisterEvent(evt)){
						connected = true;
						client.trigger({type: 'connected'});
					}
					break;
				}

			case tsip_event_code_e.DIALOG_TERMINATING:
 				{
					if(isRegisterEvent(evt)){
						connected = false;
						client.trigger({type: 'disconnecting'});
					}
					break;
				}
			case tsip_event_code_e.DIALOG_TERMINATED:
 				{
					if(isRegisterEvent(evt)){
						connected = false;
						if(disconnectByUser)
							client.trigger({type: 'disconnected'});
						else{
							console.log(evt);
							client.trigger({type: 'connecterror', reason: evt.s_phrase});
						}
					}
					break;
				}
        }
    };

	var onSipEventMessage = function (evt){
		console.debug(evt.s_phrase);
		switch (evt.e_message_type) {
			case tsip_event_message_type_e.I_MESSAGE:
				{
					evt.get_session().accept();
					var uri = evt.get_session().o_uri_from;
					client.trigger({
						type: 'incomingmessage',
						sender: uri.s_scheme + ':' + uri.s_user_name + '@' + uri.s_host,
						time: new Date(),
						text: evt.get_message().get_content_as_string()
					});
					break;
				}
			case tsip_event_message_type_e.AO_MESSAGE:
				{
					if(isMessageEvent(evt)){
						client.trigger({
							type: 'sentone', 
							id: evt.get_session().get_id(),
							uri: evt.get_session().o_uri_to.toString(),
							success: (evt.i_code >= 200 && evt.i_code <= 299),
							phrase: evt.s_phrase
						});
					}
					break;
				}
		}
	}
	
	var isRegisterEvent = function(evt){
		return oSipSessionRegister && evt.get_session().get_id() == oSipSessionRegister.get_id();
	};

	var isMessageEvent = function(evt){
		return messageSessions.indexOf(evt.get_session()) >= 0;
	}

	this.handlers = [];
	
	this.onAny = function(handler) {
		this.handlers.push(handler);
	};

	this.trigger = function(event){
		for (var i=0; i<this.handlers.length; i++)
			this.handlers[i](event);
	};
}